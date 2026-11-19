import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
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
import { firstValueFrom } from "rxjs";
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
interface Proposal {
  id: string;
  facts: {
    statement: string;
    effectiveDate: string | null;
    precision: string;
    change: string;
  }[];
  clarification: string | null;
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
export class OnboardingPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  @ViewChild("turns") private turns?: ElementRef<HTMLElement>;
  private readonly route = inject(ActivatedRoute);
  readonly api =
    devAgentApiOverride(this.route.snapshot.queryParamMap.get("api")) ??
    environment.apiUrl;
  readonly snapshot = signal<Snapshot | null>(null);
  readonly proposal = signal<Proposal | null>(null);
  readonly busy = signal(false);
  readonly error = signal("");
  readonly summary = signal(false);
  readonly ButtonColor = ButtonColor;
  readonly summaryText = signal("");
  readonly summarizing = signal(false);
  get placeholder() {
    const prompt = this.currentPrompt;
    return this.snapshot()?.turns.length && prompt.length < 180
      ? prompt
      : "אפשר להמשיך לספר, לשאול מה אני זוכר או לבקש הכוונה…";
  }
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
    if (this.busy() || this.proposal() || this.draft.trim()) return;
    if (this.summaryText()) {
      this.summary.set(true);
      return;
    }
    await this.run(async () => {
      this.summarizing.set(true);
      try {
        await this.loadSummary();
        this.summary.set(true);
      } finally {
        this.summarizing.set(false);
      }
    });
  }
  private async loadSummary() {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    const result = await firstValueFrom(
      this.http.post<{ story: string }>(
        this.api + "api/agent-profile/summary",
        {
          businessNumber: snapshot.businessNumber,
          version: snapshot.version,
        }
      )
    );
    this.summaryText.set(result.story);
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
  get currentPrompt() {
    const s = this.snapshot();
    return s?.turns.at(-1)?.assistant_text ?? s?.opening ?? "";
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
            this.api + "api/agent-profile/businesses"
          )
        )
      );
      if (this.businesses().length === 1) {
        this.selected = this.businesses()[0].number;
        await this.load();
      }
    });
  }
  private async load() {
    this.snapshot.set(
      await firstValueFrom(
        this.http.get<Snapshot>(this.api + "api/agent-profile", {
          params: { businessNumber: this.selected },
        })
      )
    );
  }
  async select() {
    this.snapshot.set(null);
    this.proposal.set(null);
    this.summary.set(false);
    this.summaryText.set("");
    this.draft = "";
    await this.run(() => this.load());
  }
  async send() {
    const s = this.snapshot();
    if (!s || this.busy() || this.proposal()) return;
    const message = this.draft.trim();
    if (!message) return;
    await this.run(async () => {
      const body = {
        businessNumber: s.businessNumber,
        version: s.version,
        message,
      };
      this.proposal.set(
        await firstValueFrom(
          this.http.post<Proposal>(this.api + "api/agent-profile/propose", body)
        )
      );
      await this.commitPending();
    });
  }
  private async commitPending() {
    const proposal = this.proposal();
    if (!proposal) return;
    this.snapshot.set(
      await firstValueFrom(
        this.http.post<Snapshot>(this.api + "api/agent-profile/commit", {
          businessNumber: this.selected,
          proposalId: proposal.id,
        })
      )
    );
    this.proposal.set(null);
    this.draft = "";
    this.summaryText.set("");
    afterNextRender(
      () => {
        const element = this.turns?.nativeElement;
        if (element) element.scrollTop = element.scrollHeight;
      },
      { injector: this.injector }
    );
  }
  async save() {
    await this.run(() => this.commitPending());
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
          })
        )
      );
      this.forgetting.set(null);
      this.summaryText.set("");
      if (this.summary()) await this.loadSummary();
      this.proposal.set(null);
    });
  }
  async refresh() {
    await this.run(async () => {
      this.proposal.set(null);
      await this.load();
      this.summaryText.set("");
      if (this.summary()) await this.loadSummary();
    });
  }
  private async run(work: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await work();
    } catch (e) {
      const err = e as HttpErrorResponse;
      const message = err.error?.message;
      if (err.status === 409) this.proposal.set(null);
      this.error.set(
        err.status === 409
          ? "הפרופיל השתנה בחלון אחר. רענן את המידע ושלח שוב; הטקסט שכתבת נשאר כאן."
          : typeof message === "string"
          ? message
          : err.status === 503
          ? "שיחת ההיכרות אינה זמינה כרגע. אפשר לנסות שוב בהמשך."
          : "לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב."
      );
    } finally {
      this.busy.set(false);
    }
  }
}
