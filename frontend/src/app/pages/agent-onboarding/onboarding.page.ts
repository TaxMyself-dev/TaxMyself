import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  OnDestroy,
  computed,
  effect,
  ElementRef,
  ViewChild,
  afterNextRender,
  Injector,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { ButtonComponent } from "../../components/button/button.component";
import { ButtonColor } from "../../components/button/button.enum";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { DialogModule } from "primeng/dialog";
import { firstValueFrom, take } from "rxjs";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import type { UIMessage } from "ai";
import {
  callDevAgentFunction,
  createDevAgentChat,
  readDevAgentConversation,
  DevAgentRequestAuth,
} from "../dev-agent/dev-agent-chat";
import { environment } from "src/environments/environment";
import { devAgentApiOverride } from "../dev-agent/dev-agent.route";

interface Field {
  key: string;
  label: string;
  question: string;
  scope: string;
  value: string | null;
  state: string;
}
interface Fact {
  id: string;
  statement: string;
  status: string;
  scope_kind: string;
  effective_date: string | null;
  valid_to_text: string | null;
  date_precision: string;
  recorded_at: string;
  change_kind: string;
}
interface Snapshot {
  businessNumber: string;
  version: { person: number; business: number };
  invitation: string;
  story: { person: string; business: string; narrative?: string };
  fields: Field[];
  facts: Fact[];
  turns: { source_text: string; assistant_text: string }[];
  missing: string[];
  opening: string;
}
@Component({
  selector: "app-agent-onboarding",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonComponent,
    DialogModule,
    TextareaModule,
    SelectModule,
  ],
  templateUrl: "./onboarding.page.html",
  styleUrls: ["./onboarding.page.scss"],
})
export class OnboardingPage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  @ViewChild("turns") private turns?: ElementRef<HTMLElement>;
  private readonly route = inject(ActivatedRoute);
  readonly api =
    devAgentApiOverride(this.route.snapshot.queryParamMap.get("api")) ??
    environment.apiUrl;
  readonly snapshot = signal<Snapshot | null>(null);
  private readonly afAuth = inject(AngularFireAuth);
  private readonly auth: DevAgentRequestAuth = {
    token: () => firstValueFrom(this.afAuth.idToken.pipe(take(1))),
    clientId: () => null,
  };
  readonly chat = signal<ReturnType<typeof createDevAgentChat> | null>(null);
  private readonly loading = signal(false);
  readonly busy = computed(
    () =>
      this.loading() ||
      ["submitted", "streaming"].includes(this.chat()?.status ?? ""),
  );
  readonly thinking = computed(() =>
    ["submitted", "streaming"].includes(this.chat()?.status ?? ""),
  );
  private finishRequested = false;
  private generation = 0;
  private destroyed = false;
  private conversationId = "";
  readonly messages = computed(() =>
    (this.chat()?.messages ?? []).flatMap((message) => {
      const text = message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n");
      return text ? [{ id: message.id, role: message.role, text }] : [];
    }),
  );
  private readonly scrollWithConversation = effect(() => {
    this.messages();
    this.thinking();
    this.scrollToLatest();
  });
  ngOnDestroy() {
    this.destroyed = true;
    this.generation++;
    void this.chat()?.stop();
  }
  private scrollToLatest() {
    if (this.destroyed) return;
    afterNextRender(
      () => {
        const element = this.turns?.nativeElement;
        if (element) element.scrollTop = element.scrollHeight;
      },
      { injector: this.injector },
    );
  }
  private async openChat() {
    const generation = ++this.generation;
    void this.chat()?.stop();
    this.chat.set(null);
    const session = (await callDevAgentFunction(
      this.api,
      this.auth,
      "readAgentSession",
      {},
    )) as { userId: string };
    if (generation !== this.generation) return;
    const key = `keepintax:onboarding:${session.userId}:${this.selected}`;
    const stored = localStorage.getItem(key);
    this.conversationId =
      stored && /^[a-f0-9-]{36}$/i.test(stored) ? stored : crypto.randomUUID();
    const history = stored
      ? await readDevAgentConversation(
          this.api,
          this.auth,
          session.userId,
          this.conversationId,
        )
      : [];
    if (generation !== this.generation) return;
    localStorage.setItem(key, this.conversationId);
    this.chat.set(
      createDevAgentChat({
        apiUrl: this.api,
        auth: this.auth,
        agentUserId: session.userId,
        conversationId: this.conversationId,
        locale: "he",
        messages: history,
        onboarding: { businessNumber: this.selected },
        onData: () => this.scrollToLatest(),
        onError: (failure) => {
          console.warn("ONBOARDING_CHAT_FAILED", {
            conversationId: this.conversationId,
            message: failure.message,
          });
          if (generation !== this.generation) return;
          this.summarizing.set(false);
          this.finishRequested = false;
          this.error.set("לא הצלחנו להשלים את התשובה. אפשר לרענן ולנסות שוב.");
        },
        onFinish: (outcome) => {
          if (generation !== this.generation) return;
          if (outcome.isError || outcome.isAbort || outcome.isDisconnect) {
            this.finishRequested = false;
            this.summarizing.set(false);
            return;
          }
          void this.answerFinished();
        },
      }),
    );
    if (history.length) await this.chat()?.resumeStream();
    this.scrollToLatest();
  }
  private async answerFinished() {
    const generation = this.generation;
    this.loading.set(true);
    try {
      await this.load();
      if (generation !== this.generation) return;
      if (this.finishRequested) {
        const last = this.messages()
          .filter((message) => message.role === "assistant")
          .at(-1);
        this.summaryText.set(last?.text ?? "");
        this.summary.set(true);
      }
    } catch (failure) {
      console.warn("ONBOARDING_PROFILE_REFRESH_FAILED", {
        conversationId: this.conversationId,
        status: (failure as HttpErrorResponse).status,
      });
      this.error.set("התשובה התקבלה, אך לא הצלחנו לרענן את הפרטים שנשמרו.");
    } finally {
      this.loading.set(false);
      this.finishRequested = false;
      this.summarizing.set(false);
      this.scrollToLatest();
    }
  }
  readonly error = signal("");
  readonly summary = signal(false);
  readonly ButtonColor = ButtonColor;
  readonly summaryText = signal("");
  readonly summarizing = signal(false);
  onComposerKeydown(event: KeyboardEvent) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.isComposing ||
      event.keyCode === 229
    )
      return;
    event.preventDefault();
    void this.send();
  }
  async finish() {
    if (this.busy() || this.draft.trim() || !this.chat()) return;
    this.finishRequested = true;
    this.summarizing.set(true);
    await this.chat()!.sendMessage({
      text: "בוא נסיים כאן את ההיכרות לעכשיו. סכם לי בסיפור רציף וטבעי מה אתה יודע עליי ועל העסק, כולל שינויים משמעותיים ומועדיהם אם ידועים. אל תוסיף שאלת המשך.",
    });
  }
  fieldsFor(scope: string) {
    return this.snapshot()?.fields.filter((f) => f.scope === scope) ?? [];
  }
  readonly forgetting = signal<string | null>(null);
  readonly businesses = signal<{ number: string; name: string }[]>([]);
  selected = "";
  draft = "";
  get nextField() {
    return this.snapshot()?.fields.find((f) => f.state === "unasked");
  }
  displayField(field: Field) {
    if (!field.value) return this.label(field.state);
    const booleanLabels: Record<string, string> = {
      yes: "כן",
      no: "לא",
      true: "כן",
      false: "לא",
    };
    return booleanLabels[field.value.trim().toLowerCase()] ?? field.value;
  }
  label(state: string) {
    return (
      (
        {
          known: "נמסר",
          unknown: "עדיין לא ידוע",
          skipped: "נשאיר להמשך",
          not_applicable: "לא רלוונטי",
          unasked: "עדיין לא סיפרת",
        } as Record<string, string>
      )[state] ?? state
    );
  }
  async ngOnInit() {
    await this.run(async () => {
      this.businesses.set(
        await firstValueFrom(
          this.http.get<{ number: string; name: string }[]>(
            this.api + "api/agent-profile/businesses",
          ),
        ),
      );
      const requested=this.route.snapshot.queryParamMap.get('businessNumber');
      if (this.businesses().length === 1 || this.businesses().some(b=>b.number===requested)) {
        this.selected = requested && this.businesses().some(b=>b.number===requested) ? requested : this.businesses()[0].number;
        await this.load();
        await this.openChat();
      }
    });
  }
  private async load() {
    const requested = this.selected;
    const generation = this.generation;
    const snapshot = await firstValueFrom(
      this.http.get<Snapshot>(this.api + "api/agent-profile", {
        params: { businessNumber: requested },
      }),
    );
    if (this.selected === requested && generation === this.generation)
      this.snapshot.set(snapshot);
  }
  async select() {
    this.snapshot.set(null);
    this.summary.set(false);
    this.summaryText.set("");
    this.draft = "";
    await this.run(async () => {
      await this.load();
      await this.openChat();
    });
  }
  async send() {
    if (!this.snapshot() || this.busy() || !this.chat()) return;
    const text = this.draft.trim();
    if (!text) return;
    this.error.set("");
    this.summaryText.set("");
    this.draft = "";
    try {
      await this.chat()!.sendMessage({ text });
    } catch {
      this.error.set("לא הצלחנו לשלוח את ההודעה. אפשר לרענן ולנסות שוב.");
    }
    this.scrollToLatest();
  }
  async forget(factId: string) {
    const s = this.snapshot();
    if (!s) return;
    await this.run(async () => {
      this.snapshot.set(
        await firstValueFrom(
          this.http.post<Snapshot>(this.api + "api/agent-profile/forget", {
            businessNumber: this.selected,
            factId,
            version: s.version,
          }),
        ),
      );
      this.forgetting.set(null);
      this.summaryText.set("");
      this.summary.set(false);
    });
  }
  async refresh() {
    await this.run(async () => {
      await this.load();
      await this.openChat();
      this.summaryText.set("");
      this.summary.set(false);
    });
  }
  private async run(work: () => Promise<void>) {
    if (this.busy()) return;
    this.loading.set(true);
    this.error.set("");
    try {
      await work();
    } catch (e) {
      const err = e as HttpErrorResponse;
      const message = err.error?.message;
      this.error.set(
        err.status === 409
          ? "הפרופיל השתנה בחלון אחר. רענן את המידע ושלח שוב; הטקסט שכתבת נשאר כאן."
          : typeof message === "string"
            ? message
            : err.status === 503
              ? "שיחת ההיכרות אינה זמינה כרגע. אפשר לנסות שוב בהמשך."
              : "לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב.",
      );
    } finally {
      this.loading.set(false);
    }
  }
}
