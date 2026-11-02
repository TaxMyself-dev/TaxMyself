import { PlanCardComponent, PricingCardPlan } from '../plan-card.component';
import { PLAN_CARD_ITEMS } from '../billing-plans.page';
import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ChangePaymentMethodDialogComponent } from 'src/app/components/change-payment-method-dialog/change-payment-method-dialog.component';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { OpenBankingNavigationService } from 'src/app/services/open-banking-navigation.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { OpenBankingEnrollmentOptions, OpenBankingEnrollmentService } from 'src/app/services/open-banking-enrollment.service';

@Component({
  standalone: true,
  imports: [A11yModule, CommonModule, FormsModule, RouterLink, ChangePaymentMethodDialogComponent, PlanCardComponent],
  templateUrl: './open-banking.page.html',
  styleUrls: ['./open-banking.page.scss'],
})
export class OpenBankingPage implements OnInit {
  private readonly navigation = inject(OpenBankingNavigationService);
  private readonly enrollment = inject(OpenBankingEnrollmentService);
  private readonly billing = inject(BillingStateService);
  private readonly feezback = inject(FeezbackService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute, { optional: true });
  readonly options = signal<OpenBankingEnrollmentOptions | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly cardDialog = signal(false);
  readonly identityDialog = signal(false);
  readonly spouseConnection = signal(false);
  selectedPlanId: number | null = null;
  cancelPlanId: number | null = null;
  private continueAfterCard = false;
  private cardSaveHandled = false;


  async ngOnInit() {
    this.navigation.begin(this.route?.snapshot.queryParamMap.get('resumeCard') === '1');
    await this.load();
    if (this.options()?.complimentary || this.options()?.status === 'ACTIVE') {
      await this.continue();
      return;
    }
    if (this.route?.snapshot.queryParamMap.get('resumeCard') === '1' &&
      this.options()?.hasSavedCard && this.options()?.enrollment && this.options()?.status === 'TRIAL') {
      this.continueAfterCard = true;
      await this.router.navigate([], { queryParams: { resumeCard: null }, queryParamsHandling: 'merge', replaceUrl: true });
      await this.cardSaved();
    }
  }
  async load() {
    this.busy.set(true); this.error.set('');
    try {
      const options = await this.enrollment.options();
      this.options.set(options);
      this.selectedPlanId = options.enrollment?.planId ?? options.plans[0]?.id ?? null;
      this.cancelPlanId = options.nonBankingPlans[0]?.id ?? null;
    } catch (error) {
      this.options.set(null);
      this.showFailure('options', error);
    }
    finally { this.busy.set(false); }
  }
  async retryLoad() {
    if (this.busy()) return;
    await this.load();
    if (this.options()?.complimentary || this.options()?.status === 'ACTIVE') await this.continue();
  }
  private showFailure(step: 'options' | 'prepare' | 'connection-options' | 'consent-link', error?: unknown) {
    const messages = {
      options: 'לא הצלחנו לטעון את פרטי ההצטרפות. אפשר לנסות שוב. אם הבעיה נמשכת, פנו לתמיכה.',
      prepare: 'לא הצלחנו לאשר את ההצטרפות לחיבור. נסו שוב או רעננו את פרטי התוכנית. אם הבעיה נמשכת, פנו לתמיכה.',
      'connection-options': 'לא הצלחנו לבדוק את אפשרויות החיבור לבנקאות פתוחה. נסו שוב. אם הבעיה נמשכת, פנו לתמיכה.',
      'consent-link': 'לא הצלחנו ליצור קישור מאובטח לחיבור הבנק. נסו שוב. אם הבעיה נמשכת, פנו לתמיכה.',
    };
    const status = (error as { status?: unknown } | null)?.status;
    const code = typeof status === 'number' && [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].includes(status)
      ? ` (קוד שגיאה: ${status})` : '';
    this.error.set(messages[step] + code);
  }
  planCard(plan: OpenBankingEnrollmentOptions['plans'][number]): PricingCardPlan {
    return { id: plan.id, name: plan.name, badge: plan.badge ?? null, recommended: !!plan.recommended,
      displayPrice: (plan.amountAgorot / 100).toFixed(2), notes: 'לחודש, כולל מע״מ',
      features: PLAN_CARD_ITEMS.map(item => ({...item, included: item.type === 'module' ? (plan.modules ?? []).includes(item.key) : (plan.features ?? []).includes(item.key)}))
        .filter(item => plan.isPublic !== false || item.type === 'module' || item.included) };
  }
  async choosePlan(planId: number) {
    if (this.busy()) return;
    this.selectedPlanId = planId;
    await this.continue();
  }
  async continue() {
    const options = this.options();
    if (!options || this.busy()) return;
    if (this.billing.hasBillingOverride()) { await this.navigation.returnToOrigin(); return; }
    const plan = options.plans.find(p => p.id === this.selectedPlanId);
    if (!options.complimentary && options.status !== 'ACTIVE' && !plan) return;
    this.busy.set(true); this.error.set('');
    let failureStep: 'prepare' | 'options' = 'prepare';
    try {
      if (!options.complimentary && options.status !== 'ACTIVE') await this.enrollment.prepare(plan!.id, plan!.quote);
      failureStep = 'options';
      const updated = await this.enrollment.options();
      this.options.set(updated);
      if (!updated.complimentary && !updated.hasSavedCard && updated.status !== 'ACTIVE') {
        this.continueAfterCard = true;
        this.cardDialog.set(true);
        return;
      }
      await this.connect();
    } catch (error) {
      if (!this.error()) this.showFailure(failureStep, error);
    } finally { this.busy.set(false); }
  }
  onCardDialogChange(visible: boolean) {
    this.cardDialog.set(visible);
    if (visible) return;
    this.cardSaveHandled = false;
    // The dialog closes immediately before emitting saved in the same turn.
    queueMicrotask(() => {
      if (!this.cardSaveHandled) void this.cancelConnection();
    });
  }
  async cardSaved() {
    this.cardSaveHandled = true;
    if (!this.continueAfterCard) { await this.load(); return; }
    this.continueAfterCard = false;
    this.busy.set(true); this.error.set('');
    try { await this.connect(); }
    catch (error) { if (!this.error()) this.showFailure('connection-options', error); }
    finally { this.busy.set(false); }
  }
  private async connect() {
    let options: { offerSpouse: boolean };
    try { options = await firstValueFrom(this.feezback.connectionOptions()); }
    catch (error) { this.showFailure('connection-options', error); throw error; }
    if (options.offerSpouse) {
      this.spouseConnection.set(false);
      this.identityDialog.set(true);
      return;
    }
    await this.redirectToFeezback(false);
  }
  async confirmIdentity() {
    if (this.busy() || !this.identityDialog()) return;
    this.busy.set(true); this.error.set('');
    try { await this.redirectToFeezback(this.spouseConnection()); this.identityDialog.set(false); }
    catch (error) { if (!this.error()) this.showFailure('consent-link', error); }
    finally { this.busy.set(false); }
  }
  async cancelConnection() {
    if (this.busy()) return;
    this.identityDialog.set(false);
    await this.navigation.returnToOrigin();
  }
  private async redirectToFeezback(spouse: boolean) {
    try {
      const response = await firstValueFrom(this.feezback.createConsentLink(spouse));
      const link = response?.link || response?.url || response;
      if (typeof link !== 'string' || !link.startsWith('https://')) throw new Error('Invalid consent URL');
      window.location.replace(link);
    } catch (error) { this.showFailure('consent-link', error); throw error; }
  }
  async cancel() {
    const request = this.options()?.enrollment;
    if (!request || this.busy() || !this.cancelPlanId) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.enrollment.cancel(request.eventId, this.cancelPlanId);
      await this.billing.reloadBillingStateQuietly();
      await this.router.navigate(['/settings'], { queryParams: { tab: 'subscription' } });
    } catch { this.error.set('מצב ההרשמה השתנה. רעננו את הפרטים ונסו שוב.'); }
    finally { this.busy.set(false); }
  }
}
