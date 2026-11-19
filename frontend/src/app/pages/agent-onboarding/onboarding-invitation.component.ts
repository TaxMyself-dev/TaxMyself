import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { RouterLink } from "@angular/router";
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
  imports: [RouterLink],
  template: ` <dialog
    #invitation
    dir="rtl"
    aria-labelledby="onboarding-invite-title"
    (cancel)="later(); $event.preventDefault()"
    style="padding:28px;background:#e8f3f5;border:1px solid #b8d6dd;border-radius:12px;max-width:min(650px,90vw);color:#183744"
  >
    <h2 id="onboarding-invite-title">נכיר קצת את העסק שלך?</h2>
    <p>
      אפשר לספר במילים שלך או לתת לי להכווין בשאלות. ההיכרות תעזור לי להתאים לך
      את העזרה בהמשך.
    </p>
    <p>אפשר לעצור ולהמשיך בכל רגע דרך ״ההיכרות שלי עם הסוכן״ בתפריט.</p>
    <a [routerLink]="onboardingPath" (click)="close()">בואו נכיר</a>
    <button type="button" (click)="later()" style="margin-right:20px">
      אחר כך
    </button>
  </dialog>`,
})
export class OnboardingInvitationComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input({ required: true }) apiUrl = "";
  @Input({ required: true }) ownerUid = "";
  @Input() sessionId = "";
  @Input() allowPopup = true;
  @ViewChild("invitation") private invitation?: ElementRef<HTMLDialogElement>;
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
    const dialog = this.invitation?.nativeElement;
    if (!dialog || !this.show() || !this.allowPopup || dialog.open) return;
    const blocked = Array.from(
      document.querySelectorAll(
        "ion-modal,ion-alert,.p-dialog-mask,dialog[open]"
      )
    ).some((element) => {
      if (element === dialog || element.getAttribute("aria-hidden") === "true")
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
    dialog.showModal();
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
    this.invitation?.nativeElement.close();
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
