import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { environment } from "../../../environments/environment";

type ConnectionState = "checking" | "online" | "offline";
type MessageSide = "customer" | "keepintax";

interface ChatMessage {
  id: number;
  side: MessageSide;
  text: string;
  detail?: string;
  statuses?: string[];
}

interface InboundResponse {
  signatureVerified: boolean;
  event: Record<string, unknown>;
  media: null | {
    downloaded: boolean;
    fileName: string;
    mimeType: string;
    size: number;
    sha256: string;
  };
  steps: string[];
}

interface TemplateResponse {
  providerMessageId: string;
  preview: string;
  statuses: Array<{ status: string; errorCode: number | null }>;
}

@Component({
  selector: "app-whatsapp-sandbox",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./whatsapp-sandbox.page.html",
  styleUrls: ["./whatsapp-sandbox.page.scss"],
})
export class WhatsAppSandboxPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.whatsappSandboxApiUrl}whatsapp/sandbox`;
  private nextMessageId = 3;

  readonly connection = signal<ConnectionState>("checking");
  readonly busy = signal(false);
  readonly error = signal("");
  readonly inspector = signal<InboundResponse | TemplateResponse | null>(null);
  readonly inspectorKind = signal<"inbound" | "outbound">("inbound");
  readonly messages = signal<ChatMessage[]>([
    {
      id: 1,
      side: "keepintax",
      text: "שלום! זהו ערוץ בדיקה מקומי של KeepInTax.",
      detail: "לא נשלחות הודעות אמיתיות ולא נשמר מידע.",
    },
    {
      id: 2,
      side: "customer",
      text: "מעולה, אני רוצה לשלוח מסמכים לדוגמה.",
    },
  ]);

  messageText = "שלחתי את כל המסמכים לתקופת הדיווח";
  deliveryOutcome: "success" | "failed" = "success";

  async ngOnInit(): Promise<void> {
    if (!environment.whatsappSandboxApiUrl) {
      this.connection.set("offline");
      return;
    }
    try {
      await firstValueFrom(this.http.get(this.apiUrl));
      this.connection.set("online");
    } catch {
      this.connection.set("offline");
    }
  }

  async sendText(): Promise<void> {
    const text = this.messageText.trim();
    if (!text || this.busy()) return;
    await this.sendInbound({ kind: "text", text }, text);
    if (!this.error()) this.messageText = "";
  }

  chooseFile(input: HTMLInputElement): void {
    input.value = "";
    input.click();
  }

  async sendFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.busy()) return;
    if (file.size > 2 * 1024 * 1024) {
      this.error.set("בסנדבוקס ניתן לבחור קובץ עד 2MB.");
      return;
    }
    const kind = file.type === "application/pdf" ? "pdf" : "image";
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      this.error.set("ניתן לבדוק רק PDF, JPG או PNG.");
      return;
    }
    const contentBase64 = await this.readBase64(file);
    await this.sendInbound(
      {
        kind,
        fileName: file.name,
        mimeType: file.type,
        contentBase64,
        caption: "מסמך לבדיקה",
      },
      kind === "pdf" ? `📄 ${file.name}` : `🖼️ ${file.name}`
    );
  }

  async sendTemplate(): Promise<void> {
    if (this.busy()) return;
    this.beginRequest();
    try {
      const result = await firstValueFrom(
        this.http.post<TemplateResponse>(`${this.apiUrl}/template`, {
          outcome: this.deliveryOutcome,
        })
      );
      this.messages.update((items) => [
        ...items,
        {
          id: this.nextMessageId++,
          side: "keepintax",
          text: result.preview,
          detail: `מזהה ספק: ${result.providerMessageId}`,
          statuses: result.statuses.map((status) =>
            status.errorCode
              ? `${status.status} (${status.errorCode})`
              : status.status
          ),
        },
      ]);
      this.inspectorKind.set("outbound");
      this.inspector.set(result);
      this.connection.set("online");
    } catch {
      this.failRequest();
    } finally {
      this.busy.set(false);
    }
  }

  clearConversation(): void {
    this.messages.set([]);
    this.inspector.set(null);
    this.error.set("");
  }

  eventEntries(): Array<{ key: string; value: string }> {
    const value = this.inspector();
    if (!value || !("event" in value)) return [];
    return Object.entries(value.event)
      .filter(([, entryValue]) => entryValue !== null)
      .map(([key, entryValue]) => ({
        key,
        value: Array.isArray(entryValue)
          ? entryValue.join(", ")
          : String(entryValue),
      }));
  }

  private async sendInbound(
    body: Record<string, unknown>,
    bubbleText: string
  ): Promise<void> {
    this.beginRequest();
    try {
      const result = await firstValueFrom(
        this.http.post<InboundResponse>(`${this.apiUrl}/inbound`, body)
      );
      this.messages.update((items) => [
        ...items,
        {
          id: this.nextMessageId++,
          side: "customer",
          text: bubbleText,
          detail: result.media
            ? `${this.formatBytes(result.media.size)} · ${
                result.media.mimeType
              }`
            : "הודעת טקסט",
        },
      ]);
      this.inspectorKind.set("inbound");
      this.inspector.set(result);
      this.connection.set("online");
    } catch {
      this.failRequest();
    } finally {
      this.busy.set(false);
    }
  }

  private beginRequest(): void {
    this.busy.set(true);
    this.error.set("");
  }

  private failRequest(): void {
    this.error.set(
      "הסנדבוקס לא הצליח להגיע לבקאנד המקומי בפורט 3001. ודא שהוא רץ ונסה שוב."
    );
    this.connection.set("offline");
  }

  private readBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(String(reader.result).split(",", 2)[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private formatBytes(size: number): string {
    return size < 1024 ? `${size} bytes` : `${(size / 1024).toFixed(1)} KB`;
  }
}
