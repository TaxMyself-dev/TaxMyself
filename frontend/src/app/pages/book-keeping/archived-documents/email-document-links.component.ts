import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  EMAIL_LINK_REASONS,
  EmailDocumentLinksService,
  PendingEmailLink,
} from "src/app/services/email-document-links.service";

@Component({
  selector: "app-email-document-links",
  standalone: true,
  imports: [CommonModule],
  template: ` <section class="email-links" aria-label="מסמכים מקישורי מייל">
    <div class="heading">
      <h3>מסמכים מקישורי מייל שממתינים להעלאה</h3>
      <button type="button" [disabled]="loading()" (click)="load()">
        רענון
      </button>
    </div>
    @if (loading()) {
    <p role="status">טוען מסמכים…</p>
    } @if (message()) {
    <p role="status" aria-live="polite">{{ message() }}</p>
    } @if (!loading() && !items().length && !message()) {
    <p>אין קישורים שממתינים לטיפול.</p>
    } @for (row of items(); track row.id) {
    <article>
      <div>
        <strong>{{ row.subject || row.name }}</strong>
        <p>{{ row.from }}</p>
        <p>{{ reason(row.reason) }}</p>
      </div>
      <div class="actions">
        <button type="button" [disabled]="!!busy()" (click)="open(row)">
          פתיחת הקישור
        </button>
        <label
          >בחירת PDF
          <input
            type="file"
            accept=".pdf,application/pdf"
            [disabled]="!!busy()"
            (change)="select(row, $event)"
        /></label>
        @if (selected()?.id === row.id) {
        <span>{{ selected()?.file?.name }}</span>
        <button type="button" [disabled]="!!busy()" (click)="upload(row)">
          {{ busy() === row.id ? "מעלה…" : "העלאה ושיוך למייל" }}
        </button>
        }
      </div>
    </article>
    } @if (cursor()) {
    <button type="button" [disabled]="loading()" (click)="load(true)">
      הצגת קישורים נוספים
    </button>
    }
    <p class="hint">
      אפשר לפתוח את הקישור, להוריד את המסמך ולהעלות אותו כאן. הקובץ יישמר עם
      הקשר למייל ויעבור לעיבוד.
    </p>
  </section>`,
  styles: [
    `
      .email-links {
        border: 1px solid #d9dee7;
        border-radius: 12px;
        padding: 1rem;
        margin: 1rem 0;
        background: #fff;
      }
      .heading,
      .actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .heading {
        justify-content: space-between;
      }
      h3 {
        margin: 0;
        font-size: 1rem;
      }
      article {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        border-top: 1px solid #e5e7eb;
        padding: 0.85rem 0;
      }
      p {
        margin: 0.35rem 0;
        overflow-wrap: anywhere;
      }
      .hint {
        color: #526174;
        font-size: 0.85rem;
      }
      button {
        border: 1px solid #64748b;
        border-radius: 6px;
        background: white;
        padding: 0.45rem 0.7rem;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      input {
        max-width: 220px;
      }
    `,
  ],
})
export class EmailDocumentLinksComponent {
  readonly businessNumber = input.required<string>();
  readonly uploaded = output<void>();
  readonly items = signal<PendingEmailLink[]>([]);
  readonly loading = signal(false);
  readonly cursor = signal<string | null>(null);
  readonly message = signal("");
  readonly busy = signal("");
  readonly selected = signal<{ id: string; file: File } | null>(null);
  private readonly api = inject(EmailDocumentLinksService);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  constructor() {
    effect(() => {
      const business = this.businessNumber();
      this.generation++;
      this.items.set([]);
      this.cursor.set(null);
      this.selected.set(null);
      this.busy.set("");
      this.message.set("");
      if (business) this.load(false, business);
    });
  }
  reason(code: string) {
    return (
      EMAIL_LINK_REASONS[code] || EMAIL_LINK_REASONS["LINK_MANUAL_REQUIRED"]
    );
  }
  load(more = false, business = this.businessNumber()) {
    const generation = this.generation;
    this.loading.set(true);
    this.message.set("");
    this.api
      .list(business, more ? this.cursor() || undefined : undefined)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (generation !== this.generation) return;
          this.items.set(more ? [...this.items(), ...r.items] : r.items);
          this.cursor.set(r.nextCursor);
          this.loading.set(false);
        },
        error: () => {
          if (generation === this.generation) {
            this.loading.set(false);
            this.message.set("לא ניתן לטעון קישורי מסמכים כרגע.");
          }
        },
      });
  }
  select(row: PendingEmailLink, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.message.set("");
    this.selected.set(null);
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      this.message.set("יש לבחור קובץ PDF עד 10MB.");
      return;
    }
    this.selected.set({ id: row.id, file });
  }
  open(row: PendingEmailLink) {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const generation = this.generation;
    this.api
      .original(row.id, this.businessNumber())
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (generation !== this.generation) {
            tab?.close();
            return;
          }
          try {
            const url = new URL(r.url);
            if (url.protocol !== "https:" || url.username || url.password)
              throw Error();
            if (tab) tab.location.href = url.href;
            else this.message.set("יש לאפשר פתיחת חלון חדש ולנסות שוב.");
          } catch {
            tab?.close();
            this.message.set("לא ניתן לפתוח את הקישור.");
          }
        },
        error: () => {
          tab?.close();
          if (generation === this.generation)
            this.message.set("לא ניתן לפתוח את הקישור כרגע.");
        },
      });
  }
  upload(row: PendingEmailLink) {
    const selected = this.selected();
    if (this.busy() || !selected || selected.id !== row.id) return;
    const generation = this.generation;
    this.busy.set(row.id);
    this.message.set("");
    this.api
      .upload(row.id, this.businessNumber(), selected.file)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          if (generation !== this.generation) return;
          this.busy.set("");
          this.selected.set(null);
          this.items.update((rows) => rows.filter((r) => r.id !== row.id));
          this.message.set("המסמך נשמר וממתין לעיבוד.");
          this.uploaded.emit();
        },
        error: () => {
          if (generation === this.generation) {
            this.busy.set("");
            this.message.set("ההעלאה לא הושלמה. הקישור נשמר ואפשר לנסות שוב.");
          }
        },
      });
  }
}
