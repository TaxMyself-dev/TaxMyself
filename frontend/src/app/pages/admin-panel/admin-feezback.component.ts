import { CommonModule } from "@angular/common";
import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { EMPTY, expand, finalize, reduce, timer } from "rxjs";
import { DialogModule } from "primeng/dialog";
import { environment } from "src/environments/environment";

export interface FeezbackAdminRow {
  firebaseId: string;
  name: string;
  email: string;
  synthetic: boolean;
  hasOpenBanking: boolean;
  entitlement: {
    eligible: boolean | null;
    reason: string;
    until: string | null;
    plan: string | null;
    subscriptionStatus: string | null;
  };
  evidence: Record<
    "primary" | "spouse",
    {
      consents: Array<{
        id: string;
        status: string;
        validUntil: string | null;
      }>;
      checkedAt: string | null;
      error: string | null;
    }
  >;
  primaryUnits: number | null;
  spouseUnits: number | null;
  expectedUnits: number | null;
  stale: boolean;
  mismatch: boolean;
  pending: boolean;
  disconnectRequested: boolean;
  lastAction: string | null;
  lastError: string | null;
}
interface FeezbackPage {
  enabled: boolean;
  automatic: boolean;
  rows: FeezbackAdminRow[];
  total: number;
}
type RowAction = "check" | "disconnect";

@Component({
  selector: "app-admin-feezback",
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule],
  templateUrl: "./admin-feezback.component.html",
  styleUrls: ["./admin-feezback.component.scss"],
})
export class AdminFeezbackComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly base = `${environment.apiUrl}admin/feezback`;
  readonly rows = signal<FeezbackAdminRow[]>([]);
  readonly loading = signal(false);
  readonly enabled = signal(false);
  readonly automatic = signal(false);
  readonly error = signal("");
  readonly message = signal("");
  readonly filter = signal("all");
  readonly search = signal("");
  readonly busy = signal<string | null>(null);
  readonly busyAction = signal<RowAction | null>(null);
  readonly queuedActions = signal<Record<string, RowAction>>({});
  readonly rowFeedback = signal<Record<string, string>>({});
  private actionVersion = 0;
  private reloadAfterCurrent = false;
  readonly selected = signal<FeezbackAdminRow | null>(null);
  readonly confirmDisconnect = signal<FeezbackAdminRow | null>(null);
  readonly page = signal(0);
  readonly filtered = computed(() => {
    const query = this.search().toLowerCase().trim();
    return this.rows()
      .filter(
        (row) =>
          (!query ||
            [row.name, row.email, row.firebaseId].some((value) =>
              value.toLowerCase().includes(query)
            )) &&
          (this.filter() === "all" ||
            (this.filter() === "mismatch" && row.mismatch) ||
            (this.filter() === "pending" && row.pending) ||
            (this.filter() === "failed" && !!row.lastError) ||
            (this.filter() === "unknown" &&
              (row.stale ||
                row.expectedUnits === null ||
                row.entitlement.eligible === null)))
      )
      .sort(
        (a, b) =>
          Number(b.mismatch) - Number(a.mismatch) ||
          Number(!!b.lastError) - Number(!!a.lastError) ||
          a.name.localeCompare(b.name, "he")
      );
  });
  readonly visible = computed(() =>
    this.filtered().slice(this.page() * 50, (this.page() + 1) * 50)
  );
  readonly mismatches = computed(
    () => this.rows().filter((row) => row.mismatch).length
  );
  readonly units = computed(() =>
    this.rows()
      .filter((row) => !row.synthetic && !row.stale)
      .reduce(
        (sum, row) => sum + (row.primaryUnits ?? 0) + (row.spouseUnits ?? 0),
        0
      )
  );
  readonly unknown = computed(
    () =>
      this.rows().filter(
        (row) =>
          !row.synthetic &&
          (row.stale ||
            row.expectedUnits === null ||
            row.entitlement.eligible === null)
      ).length
  );
  readonly monthEndWarning = computed(() => {
    const date = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
    );
    return (
      new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() -
        date.getDate() <=
        5 && this.mismatches() > 0
    );
  });
  ngOnInit() {
    this.reload();
    timer(5_000, 5_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tick) => {
        if (
          (Object.keys(this.queuedActions()).length > 0 ||
            ((tick + 1) % 6 === 0 && this.rows().some((row) => row.pending))) &&
          !this.busy() &&
          !this.loading()
        )
          this.reload();
      });
  }
  reload() {
    if (this.loading()) {
      this.reloadAfterCurrent = true;
      return;
    }
    const version = this.actionVersion;
    this.loading.set(true);
    this.error.set("");
    let nextPage = 1;
    const fetchPage = (page: number) =>
      this.http.get<FeezbackPage>(`${this.base}/users`, {
        params: { page, limit: 100 },
      });
    fetchPage(0)
      .pipe(
        expand((result) =>
          result.enabled && nextPage * 100 < result.total
            ? fetchPage(nextPage++)
            : EMPTY
        ),
        reduce(
          (all, result) => ({ ...result, rows: [...all.rows, ...result.rows] }),
          { rows: [] } as FeezbackPage
        ),
        finalize(() => {
          this.loading.set(false);
          if (this.reloadAfterCurrent) {
            this.reloadAfterCurrent = false;
            this.reload();
          }
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (result) => {
          this.rows.set(result.rows);
          this.enabled.set(result.enabled);
          this.automatic.set(result.automatic);
          this.page.set(
            Math.min(
              this.page(),
              Math.max(0, Math.ceil(this.filtered().length / 50) - 1)
            )
          );
          if (version === this.actionVersion)
            this.updateActionFeedback(result.rows);
        },
        error: () =>
          this.error.set(
            "טעינת נתוני פיזבק נכשלה. הנתונים הקודמים נשמרו; נסו לרענן."
          ),
      });
  }
  setFilter(value: string) {
    this.filter.set(value);
    this.page.set(0);
  }
  setSearch(value: string) {
    this.search.set(value);
    this.page.set(0);
  }
  action(row: FeezbackAdminRow, disconnect = false) {
    if (this.busy() || this.queuedActions()[row.firebaseId]) return;
    const kind: RowAction = disconnect ? "disconnect" : "check";
    const sending = disconnect ? "שולח בקשת ניתוק…" : "שולח בקשת בדיקה…";
    this.busy.set(row.firebaseId);
    this.busyAction.set(kind);
    this.error.set("");
    this.message.set(`${row.name}: ${sending}`);
    this.rowFeedback.update((feedback) => ({
      ...feedback,
      [row.firebaseId]: sending,
    }));
    this.http
      .post(
        `${this.base}/users/${encodeURIComponent(row.firebaseId)}/${
          disconnect ? "disconnect" : "check"
        }`,
        disconnect ? { confirm: true } : {}
      )
      .pipe(
        finalize(() => {
          this.busy.set(null);
          this.busyAction.set(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.actionVersion++;
          this.queuedActions.update((actions) => ({
            ...actions,
            [row.firebaseId]: kind,
          }));
          this.confirmDisconnect.set(null);
          const queued = disconnect
            ? "בקשת הניתוק נשמרה. ממתין לניתוק ולאימות מול פיזבק ברקע."
            : "הבדיקה נוספה לתור. התוצאה תתעדכן כאן אוטומטית.";
          this.message.set(`${row.name}: ${queued}`);
          this.rowFeedback.update((feedback) => ({
            ...feedback,
            [row.firebaseId]: queued,
          }));
          this.reload();
        },
        error: () => {
          const failed = "הבקשה לא התקבלה. נסו שוב.";
          this.message.set("");
          this.error.set(`${row.name}: ${failed}`);
          this.rowFeedback.update((feedback) => ({
            ...feedback,
            [row.firebaseId]: failed,
          }));
        },
      });
  }
  private updateActionFeedback(rows: FeezbackAdminRow[]) {
    const remaining = { ...this.queuedActions() };
    for (const [firebaseId, kind] of Object.entries(remaining)) {
      const row = rows.find((row) => row.firebaseId === firebaseId);
      if (!row || row.pending || (!row.lastError && row.disconnectRequested))
        continue;
      const unverifiedDisconnect =
        kind === "disconnect" &&
        (row.lastAction !== "DISCONNECTED" || row.expectedUnits !== 0);
      const finished = row.lastError
        ? this.errorLabel(row.lastError)
        : unverifiedDisconnect
        ? "הניתוק טרם אומת. יש לבדוק את מצב ההרשאות."
        : kind === "disconnect"
        ? "ניתוק כל ההרשאות אומת מול פיזבק."
        : "בדיקת ההרשאות הושלמה. הנתונים בטבלה עודכנו.";
      this.rowFeedback.update((feedback) => ({
        ...feedback,
        [firebaseId]: finished,
      }));
      if (row.lastError || unverifiedDisconnect) {
        this.message.set("");
        this.error.set(`${row.name}: ${finished}`);
      } else {
        this.error.set("");
        this.message.set(`${row.name}: ${finished}`);
      }
      delete remaining[firebaseId];
    }
    this.queuedActions.set(remaining);
  }
  checkLabel(row: FeezbackAdminRow) {
    if (this.busy() === row.firebaseId && this.busyAction() === "check")
      return "שולח בקשת בדיקה…";
    return this.queuedActions()[row.firebaseId] === "check"
      ? "ממתין לבדיקת פיזבק…"
      : "בדיקה מול פיזבק";
  }
  disconnectLabel(row: FeezbackAdminRow) {
    if (this.busy() === row.firebaseId && this.busyAction() === "disconnect")
      return "שולח בקשת ניתוק…";
    if (this.queuedActions()[row.firebaseId] === "disconnect")
      return "ניתוק בתהליך…";
    return row.lastAction === "DISCONNECT_PENDING"
      ? "ניסיון ניתוק חוזר"
      : "ניתוק כל ההרשאות";
  }
  unitsLabel(value: number | null) {
    return value === null ? "לא ידוע" : String(value);
  }
  status(row: FeezbackAdminRow) {
    if (row.synthetic) return "חשבון דמו";
    if (this.queuedActions()[row.firebaseId])
      return this.queuedActions()[row.firebaseId] === "disconnect"
        ? "ניתוק בתהליך"
        : "ממתין לבדיקת פיזבק";
    if (row.disconnectRequested) return "ניתוק ממתין";
    if (row.lastError) return "נדרש טיפול";
    if (row.mismatch) return "הרשאה ללא זכאות";
    if (
      row.stale ||
      row.expectedUnits === null ||
      row.entitlement.eligible === null
    )
      return "נדרשת בדיקה";
    return "תקין";
  }
  reason(value: string) {
    return (
      {
        COMPLIMENTARY: "הטבה פעילה",
        TRIAL: "ניסיון מאושר",
        TRIAL_NOT_ENROLLED: "ללא הרשמה מאושרת",
        PLAN: "תוכנית כוללת בנקאות פתוחה",
        NO_ENTITLEMENT: "אין זכאות",
        NO_SUBSCRIPTION: "לא נמצא מנוי",
        PLAN_UNKNOWN: "תוכנית לא ידועה",
        TRIAL_END_UNKNOWN: "מועד ניסיון חסר",
        BILLING_ACTIVATION_PENDING: "ממתין להשלמת מעבר מניסיון לחיוב",
      }[value] ?? value
    );
  }
  errorLabel(value: string) {
    return (
      {
        CONSENT_CHECK_FAILED: "בדיקת הרשאות נכשלה",
        DISCONNECTION_NOT_VERIFIED: "הניתוק טרם אומת",
        RECONCILIATION_FAILED: "הבדיקה או הניתוק נכשלו",
      }[value] ?? "נדרשת בדיקה חוזרת"
    );
  }
}
