import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { ReferralService } from 'src/app/services/referral.service';
import { DEFAULT_AUTHENTICATED_PATH } from 'src/app/shared/auth/default-authenticated-route';

/**
 * /referral-consent/:code — reachable only when authenticated (see
 * ReferralConsentGuard). An already-registered user who clicked an
 * accountant's referral link lands here (after logging in, if needed) to
 * grant that accountant full access. Delegation-only — never touches this
 * user's Subscription/plan/trial, unlike the brand-new-signup referral path.
 */
@Component({
  selector: 'app-referral-consent',
  standalone: true,
  imports: [CommonModule, IonicModule, ButtonComponent],
  templateUrl: './referral-consent.page.html',
  styleUrls: ['./referral-consent.page.scss'],
})
export class ReferralConsentPage implements OnInit {
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;

  readonly isLoadingInfo = signal(true);
  readonly isSubmitting = signal(false);
  readonly accountantName = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  private code = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private referralService: ReferralService,
    private messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    if (!this.code) {
      this.loadError.set('קישור ההפניה אינו תקין.');
      this.isLoadingInfo.set(false);
      return;
    }
    this.referralService.getReferralInfo(this.code).subscribe({
      next: (info) => {
        this.accountantName.set(info.accountantName);
        this.isLoadingInfo.set(false);
      },
      error: () => {
        this.loadError.set('קישור ההפניה אינו תקין או שפג תוקפו.');
        this.isLoadingInfo.set(false);
      },
    });
  }

  confirm(): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.referralService.consentToReferral(this.code).subscribe({
      next: (result) => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: result.message,
          life: 4000,
          key: 'br',
        });
        this.router.navigateByUrl(DEFAULT_AUTHENTICATED_PATH);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: err?.error?.message ?? 'אירעה שגיאה, נסה שוב מאוחר יותר',
          sticky: true,
          key: 'br',
        });
      },
    });
  }

  decline(): void {
    this.router.navigateByUrl(DEFAULT_AUTHENTICATED_PATH);
  }
}
