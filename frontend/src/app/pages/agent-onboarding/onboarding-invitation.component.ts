import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { DialogModule } from "primeng/dialog";
import { ButtonComponent } from "../../components/button/button.component";
import { ButtonColor } from "../../components/button/button.enum";
import { Subscription } from "rxjs";
import { ONBOARDING_PATH } from "./onboarding-navigation";
interface InvitationBusiness {
  number: string;
  invitation: string;
  onboardingStatus?: "not_started" | "in_progress" | "completed";
}
@Component({
  selector: "app-onboarding-invitation",
  standalone: true,
  styles: [":host { display: contents; }"],
  imports: [DialogModule, ButtonComponent],
  template: `<p-dialog dir="rtl" [visible]="visible()" (visibleChange)="dismiss($event)"
    header="היי, אני הסוכן החכם של Keepintax" [modal]="true"
    [draggable]="false" [resizable]="false" [style]="{width: '90vw', maxWidth: '560px'}">
    <div dir="rtl">
      <p>אשמח להכיר אותך ואת העסק כדי להתאים לך את העזרה בהמשך.</p>
      <p>אפשר לספר בחופשיות, או שאכווין אותך בשאלות. ההתקדמות נשמרת במהלך השיחה, ובסיום אציג את מה שהבנתי.</p>
      <p>אפשר לעצור ולחזור דרך ״ההיכרות שלי עם הסוכן״ בתפריט.</p>
      <div style="display:flex;gap:12px;margin-top:24px">
        <app-p-button buttonText="בואו נכיר" [buttonColor]="ButtonColor.BLACK" [link]="onboardingPath" (onButtonClicked)="close()" />
        <app-p-button buttonText="אחר כך" [buttonColor]="ButtonColor.WHITE_BORDER" (onButtonClicked)="later()" />
      </div>
    </div>
  </p-dialog>`,
})
export class OnboardingInvitationComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input({ required: true }) apiUrl = "";
  @Input({ required: true }) ownerUid = "";
  @Input() sessionId = "";
  @Input() allowPopup = true;
  readonly visible = signal(false);
  readonly ButtonColor = ButtonColor;
  dismiss(visible: boolean) { if (!visible && this.visible()) this.later(); }
  private readonly http = inject(HttpClient);
  readonly onboardingPath = ONBOARDING_PATH;
  readonly show = signal(false);
  private generation = 0;
  private request?: Subscription;
  private dismissal?: Subscription;
  private business = "";
  private overlayObserver?: MutationObserver;
  private seen = new Set<string>();
  private get key() {
    return (
      "keepintax.onboarding.invitation:" + this.ownerUid + ":" + this.sessionId
    );
  }
  ngOnChanges() {
    const generation = ++this.generation;
    this.request?.unsubscribe();
    this.dismissal?.unsubscribe();
    this.close();
    if (!this.ownerUid || !this.allowPopup || this.wasSeen()) return;
    this.request = this.http
      .get<InvitationBusiness[]>(this.apiUrl + "api/agent-profile/businesses")
      .subscribe({
        next: (businesses) => {
          if (generation !== this.generation || !this.allowPopup) return;
          const incomplete = businesses.find((b) =>
            b.onboardingStatus
              ? b.onboardingStatus !== "completed"
              : b.invitation !== "completed"
          );
          if (!incomplete) return;
          this.business = incomplete.number;
          this.show.set(true);
          this.openIfReady();
        },
        // Optional onboarding never blocks ordinary application use when disabled/offline.
        error: () => {},
      });
  }
  ngAfterViewInit() {
    this.openIfReady();
  }
  private wasSeen() {
    if (this.seen.has(this.key)) return true;
    try {
      return sessionStorage.getItem(this.key) === "seen";
    } catch {
      return false;
    }
  }
  private openIfReady() {
    if (!this.show() || !this.allowPopup || this.visible()) return;
    const blocked = Array.from(
      document.querySelectorAll(
        "ion-modal,ion-alert,.p-dialog-mask,dialog[open]"
      )
    ).some((element) => {
      if (element.getAttribute("aria-hidden") === "true")
        return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (blocked) {
      if (!this.overlayObserver) {
        this.overlayObserver = new MutationObserver(() => this.openIfReady());
        this.overlayObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "open", "aria-hidden"],
        });
      }
      return;
    }
    this.overlayObserver?.disconnect();
    this.overlayObserver = undefined;
    this.visible.set(true);
    this.seen.add(this.key);
    try {
      sessionStorage.setItem(this.key, "seen");
    } catch {
      /* In-memory fallback keeps navigation quiet. */
    }
  }
  close() {
    this.overlayObserver?.disconnect();
    this.overlayObserver = undefined;
    this.show.set(false);
    this.visible.set(false);
  }
  later() {
    this.close();
    this.dismissal?.unsubscribe();
    this.dismissal = this.http
      .post(this.apiUrl + "api/agent-profile/defer", {
        businessNumber: this.business,
      })
      .subscribe({ error: () => {} });
  }
  ngOnDestroy() {
    ++this.generation;
    this.request?.unsubscribe();
    this.dismissal?.unsubscribe();
    this.close();
  }
}
