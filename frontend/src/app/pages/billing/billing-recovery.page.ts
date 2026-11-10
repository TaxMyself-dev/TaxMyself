import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { BillingStateService } from '../../services/billing-state.service';
import { ButtonComponent } from '../../components/button/button.component';
import { ButtonColor, ButtonSize } from '../../components/button/button.enum';

@Component({
  standalone: true,
  selector: 'app-billing-recovery',
  imports: [ButtonComponent],
  template: `
    <main dir="rtl" class="recovery-shell">
      <section class="recovery-card">
        <header class="recovery-header">
          <span class="recovery-icon" aria-hidden="true">₪</span>
          <h1>הסדרת תשלום</h1>
          <p>להמשך השימוש במערכת יש להסדיר את יתרת החוב.</p>
        </header>

        @if (loading()) {
          <div class="recovery-state" role="status">
            <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
            <span>טוענים את פרטי התשלום…</span>
          </div>
        } @else if (pendingPayment()) {
          <div class="pending-payment" role="status">
            <i class="pi pi-info-circle" aria-hidden="true"></i>
            <p>{{ error() }}</p>
          </div>
          @if (canResumePayment()) {
            <div class="recovery-action">
              <app-p-button
                [buttonText]="'חזרה לתשלום'"
                [buttonColor]="buttonColor.BLACK"
                [buttonSize]="buttonSize.BIG"
                (onButtonClicked)="resumePayment()" />
            </div>
          } @else {
            <p class="pending-help">אם עמוד התשלום נסגר, יש לפנות לתמיכה לפני ניסיון נוסף.</p>
          }
        } @else if (error()) {
          <div class="recovery-error" role="alert">{{ error() }}</div>
        } @else {
          <div class="debt-summary">
            <div class="summary-row plan-row">
              <span>תוכנית</span>
              <strong>{{ billing.billingState()?.plan?.name }}</strong>
            </div>

            <div class="periods" aria-label="תקופות לתשלום">
              @for (period of periods(); track period.periodStart) {
                <div class="period-row">
                  <span>{{ formatDate(period.periodStart) }}–{{ formatDate(period.periodEnd) }}</span>
                  <strong>{{ (period.amountAgorot / 100).toFixed(2) }} ₪</strong>
                </div>
              }
            </div>

            <div class="summary-row total-row">
              <span>סה״כ לתשלום</span>
              <strong>{{ amountLabel() }} ₪</strong>
            </div>
            <div class="vat-note">הסכום כולל מע״מ</div>
          </div>

          @if (isCanceled()) {
            <p class="canceled-note">התשלום מסדיר את החוב בלבד ואינו מפעיל מחדש מנוי שבוטל.</p>
          }

          <div class="secure-note">
            <i class="pi pi-lock" aria-hidden="true"></i>
            <span>התשלום מתבצע באופן מאובטח באמצעות CardCom</span>
          </div>

          <div class="recovery-action">
            <app-p-button
              [buttonText]="'מעבר לתשלום'"
              [buttonColor]="buttonColor.BLACK"
              [buttonSize]="buttonSize.BIG"
              [isLoading]="submitting()"
              [disabled]="submitting()"
              (onButtonClicked)="pay()" />
          </div>
        }
      </section>
    </main>`,
  styles: [`
    :host { display: block; min-height: 100%; background: #f7f8fa; }
    .recovery-shell { min-height: calc(100vh - 72px); padding: 48px 20px; display: grid; place-items: start center; }
    .recovery-card { width: min(100%, 620px); padding: 36px; background: #fff; border: 1px solid #e4e7ec;
      border-radius: 24px; box-shadow: 0 14px 40px rgba(16, 24, 40, .08); color: #182230; }
    .recovery-header { text-align: center; }
    .recovery-icon { width: 52px; height: 52px; margin: 0 auto 16px; display: grid; place-items: center;
      border-radius: 16px; background: #fff7df; color: #9a6700; font-size: 25px; font-weight: 700; }
    h1 { margin: 0; font-size: clamp(26px, 4vw, 34px); line-height: 1.2; }
    .recovery-header p { margin: 10px 0 0; color: #667085; font-size: 16px; }
    .recovery-state { min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #667085; }
    .recovery-error { margin-top: 28px; padding: 16px; border-radius: 12px; background: #fef3f2; color: #b42318; text-align: center; }
    .pending-payment { margin-top: 28px; padding: 18px; display: flex; align-items: flex-start; justify-content: center; gap: 10px;
      border-radius: 14px; background: #f2f4f7; color: #344054; text-align: right; }
    .pending-payment p { margin: 0; }
    .pending-payment i { margin-top: 3px; color: #667085; }
    .pending-help { margin: 16px 0 0; color: #667085; text-align: center; font-size: 14px; }
    .debt-summary { margin-top: 30px; padding: 22px; border: 1px solid #e4e7ec; border-radius: 16px; background: #fcfcfd; }
    .summary-row, .period-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .plan-row { padding-bottom: 18px; border-bottom: 1px solid #eaecf0; color: #475467; }
    .plan-row strong { color: #182230; }
    .periods { display: grid; gap: 12px; padding: 18px 0; color: #475467; }
    .period-row strong { color: #344054; white-space: nowrap; }
    .total-row { padding-top: 18px; border-top: 1px solid #d0d5dd; font-size: 18px; }
    .total-row strong { font-size: 24px; color: #101828; }
    .vat-note { margin-top: 5px; color: #667085; font-size: 13px; }
    .canceled-note { margin: 18px 0 0; padding: 12px 14px; border-radius: 10px; background: #fffaeb; color: #7a2e0e; }
    .secure-note { margin-top: 24px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #667085; font-size: 14px; }
    .recovery-action { margin-top: 22px; display: flex; justify-content: center; }
    @media (max-width: 600px) {
      .recovery-shell { padding: 20px 12px; }
      .recovery-card { padding: 24px 18px; border-radius: 18px; }
      .debt-summary { padding: 18px 16px; }
      .period-row { align-items: flex-start; flex-direction: column; gap: 4px; }
    }
  `],
})
export class BillingRecoveryPage implements OnInit {
  readonly billing = inject(BillingStateService);
  private readonly http = inject(HttpClient);
  readonly buttonColor = ButtonColor;
  readonly buttonSize = ButtonSize;
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly pendingPayment = signal(false);
  readonly canResumePayment = signal(false);
  readonly error = signal('');
  readonly amountLabel = signal('');
  readonly periods = signal<Array<{ periodStart: string; periodEnd: string; amountAgorot: number }>>([]);
  private recoveryQuote = '';
  private planId: number | null = null;

  ngOnInit(): void { void this.load(); }

  private async load(): Promise<void> {
    try {
      await this.billing.loadBillingState();
      const state = this.billing.billingState();
      if (!['PAST_DUE', 'CANCELED'].includes(state?.subscription?.status ?? '') || !state?.plan || this.billing.hasBillingOverride()) {
        this.error.set('אין חוב זמין להסדרה בחשבון זה.');
        return;
      }
      this.planId = state.plan.id;
      const preview = await firstValueFrom(this.http.post<{ finalAmountAgorot: number; currency: string;
        recoveryQuote: string; periods: Array<{ periodStart: string; periodEnd: string; amountAgorot: number }> }>(
        `${environment.apiUrl}billing/checkout/preview`, { planId: this.planId },
      ));
      if (preview.currency !== 'ILS' || !preview.recoveryQuote || !preview.periods?.length) throw new Error('Invalid debt preview');
      this.recoveryQuote = preview.recoveryQuote;
      this.periods.set(preview.periods);
      this.amountLabel.set((preview.finalAmountAgorot / 100).toLocaleString('he-IL', { minimumFractionDigits: 2 }));
    } catch (err: any) {
      if (err?.error?.code === 'BILLING_PAYMENT_PENDING') {
        this.pendingPayment.set(true);
        this.error.set(err.error.message);
        this.canResumePayment.set(err.error.canResume === true);
      } else {
        this.error.set('לא ניתן לטעון את פרטי החוב. יש לרענן את העמוד או לפנות לתמיכה.');
      }
    }
    finally { this.loading.set(false); }
  }

  readonly isCanceled = () => this.billing.billingState()?.subscription?.status === 'CANCELED';

  formatDate(date: string): string {
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  }

  async resumePayment(): Promise<void> {
    if (!this.canResumePayment() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.http.post<{
        status: 'REDIRECT' | 'PROCESSING' | 'COMPLETED'; paymentUrl?: string;
      }>(`${environment.apiUrl}billing/checkout/continue`, {}));
      if (result.status === 'REDIRECT' && result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }
      this.canResumePayment.set(false);
      this.error.set(result.status === 'COMPLETED'
        ? 'התשלום הושלם. מעדכנים את החשבון…'
        : 'התשלום התקבל ונמצא בתהליך השלמה. אין לבצע תשלום נוסף.');
      await this.billing.refreshBillingState();
      if (result.status === 'COMPLETED') window.location.href = '/my-account';
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'לא ניתן לבדוק כרגע את מצב התשלום. יש לנסות שוב בעוד מספר דקות.');
      this.submitting.set(false);
    }
  }

  async pay(): Promise<void> {
    if (this.submitting() || this.loading() || this.error() || !this.planId) return;
    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.http.post<{ paymentUrl: string; lowProfileId?: string }>(
        `${environment.apiUrl}billing/checkout`, { planId: this.planId, recoveryOnly: true, recoveryQuote: this.recoveryQuote },
      ));
      sessionStorage.removeItem('tm.checkoutLowProfileId');
      if (result.lowProfileId) sessionStorage.setItem('tm.checkoutLowProfileId', result.lowProfileId);
      window.location.href = result.paymentUrl;
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'לא ניתן לפתוח תשלום. יש לפנות לתמיכה לפני ניסיון נוסף.');
      this.submitting.set(false);
    }
  }
}
