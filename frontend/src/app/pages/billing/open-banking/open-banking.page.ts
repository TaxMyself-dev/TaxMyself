import { PlanCardComponent, PricingCardPlan } from '../plan-card.component';
import { PLAN_CARD_ITEMS } from '../billing-plans.page';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ChangePaymentMethodDialogComponent } from 'src/app/components/change-payment-method-dialog/change-payment-method-dialog.component';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { OpenBankingEnrollmentOptions, OpenBankingEnrollmentService } from 'src/app/services/open-banking-enrollment.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ChangePaymentMethodDialogComponent, PlanCardComponent],
  templateUrl: './open-banking.page.html',
  styleUrls: ['./open-banking.page.scss'],
})
export class OpenBankingPage implements OnInit {
  private readonly enrollment = inject(OpenBankingEnrollmentService);
  private readonly billing = inject(BillingStateService);
  private readonly feezback = inject(FeezbackService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute, { optional: true });
  readonly options = signal<OpenBankingEnrollmentOptions | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly cardDialog = signal(false);
  selectedPlanId: number | null = null;
  cancelPlanId: number | null = null;
  private continueAfterCard = false;


  async ngOnInit() {
    await this.load();
    if (this.route?.snapshot.queryParamMap.get('resumeCard') === '1' &&
      this.options()?.hasSavedCard && this.options()?.enrollment && this.options()?.status === 'TRIAL') {
      this.continueAfterCard = true;
      await this.router.navigate([], { queryParams: { resumeCard: null }, queryParamsHandling: 'merge', replaceUrl: true });
      await this.cardSaved();
    }
  }
  async load() {
    this.busy.set(true);
    try {
      const options = await this.enrollment.options();
      this.options.set(options);
      this.selectedPlanId = options.enrollment?.planId ?? options.plans[0]?.id ?? null;
      this.cancelPlanId = options.nonBankingPlans[0]?.id ?? null;
    } catch { this.error.set('לא הצלחנו לטעון את פרטי ההרשמה. אפשר לנסות שוב.'); }
    finally { this.busy.set(false); }
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
    if (!options || this.busy() || this.billing.hasBillingOverride()) return;
    const plan = options.plans.find(p => p.id === this.selectedPlanId);
    if (!options.complimentary && options.status !== 'ACTIVE' && !plan) return;
    this.busy.set(true); this.error.set('');
    try {
      if (!options.complimentary && options.status !== 'ACTIVE') await this.enrollment.prepare(plan!.id, plan!.quote);
      const updated = await this.enrollment.options();
      this.options.set(updated);
      if (!updated.complimentary && !updated.hasSavedCard && updated.status !== 'ACTIVE') {
        this.continueAfterCard = true;
        this.cardDialog.set(true);
        return;
      }
      await this.connect();
    } catch (error: any) {
      this.error.set(typeof error?.error?.message === 'string' ? error.error.message : 'לא ניתן להמשיך כרגע. נסו שוב.');
    } finally { this.busy.set(false); }
  }
  async cardSaved() {
    if (!this.continueAfterCard) { await this.load(); return; }
    this.continueAfterCard = false;
    this.busy.set(true); this.error.set('');
    try { await this.connect(); }
    catch { this.error.set('הכרטיס נשמר, אך המעבר לפיזבק לא הושלם. אפשר לנסות להמשיך שוב.'); }
    finally { this.busy.set(false); }
  }
  private async connect() {
    const response = await firstValueFrom(this.feezback.createConsentLink());
    const link = response?.link || response?.url || response;
    if (typeof link !== 'string' || !link.startsWith('https://')) throw new Error('Invalid consent URL');
    window.location.assign(link);
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
