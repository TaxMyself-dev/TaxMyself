import {
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { RouterLink } from "@angular/router";
import { firstValueFrom } from "rxjs";
@Component({
  selector: "app-onboarding-invitation",
  standalone: true,
  imports: [RouterLink],
  template: ` <section
    dir="rtl"
    style="padding:16px 24px;border-bottom:1px solid #d8e3e8"
  >
    <a routerLink="/dev/agent/onboarding" [queryParams]="{ api: apiUrl }"
      >ההיכרות שלי עם הסוכן</a
    >
    <dialog
      #invitation
      aria-labelledby="onboarding-invite-title"
      (cancel)="later(); $event.preventDefault()"
      style="padding:28px;background:#e8f3f5;border:1px solid #b8d6dd;border-radius:12px;max-width:min(650px,90vw);color:#183744"
    >
      <h2 id="onboarding-invite-title">נעים להכיר</h2>
      <p>
        ספר לי על עצמך ועל העסק, או תן לי להכווין בשאלות. ההיכרות תעזור לי
        להתאים לך את העזרה בהמשך.
      </p>
      <a
        routerLink="/dev/agent/onboarding"
        [queryParams]="{ api: apiUrl }"
        (click)="invitation.close()"
        >בואו נכיר</a
      >
      <button
        type="button"
        (click)="later()"
        [disabled]="busy()"
        style="margin-right:20px"
      >
        אחר כך
      </button>
      @if (error()) {
      <p role="alert">{{ error() }}</p>
      }
    </dialog>
  </section>`,
})
export class OnboardingInvitationComponent implements OnInit {
  @Input({ required: true }) apiUrl = "";
  @ViewChild("invitation") private invitation?: ElementRef<HTMLDialogElement>;
  private readonly http = inject(HttpClient);
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly error = signal("");
  private business = "";
  async ngOnInit() {
    try {
      const businesses = await firstValueFrom(
        this.http.get<{ number: string; invitation: string }[]>(
          this.apiUrl + "api/agent-profile/businesses"
        )
      );
      if (businesses.length > 0) {
        this.business = businesses[0].number;
        this.show.set(businesses[0].invitation === "new");
        if (this.show()) this.invitation?.nativeElement.showModal();
      }
    } catch {
      /* The optional invitation cannot interrupt ordinary chat when onboarding is disabled. */
    }
  }
  async later() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(this.apiUrl + "api/agent-profile/defer", {
          businessNumber: this.business,
        })
      );
      this.show.set(false);
      this.invitation?.nativeElement.close();
    } catch {
      this.error.set("לא הצלחנו לשמור את הבחירה. אפשר לנסות שוב.");
    } finally {
      this.busy.set(false);
    }
  }
}
