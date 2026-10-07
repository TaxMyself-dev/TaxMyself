import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { GenericService } from '../../services/generic.service';
import { ProgressSpinner } from 'primeng/progressspinner';
import { RouterLink } from '@angular/router';
import { BillingStateService } from '../../services/billing-state.service';

interface PlanChangePreview {
  action: 'UPGRADE' | 'DOWNGRADE'; targetPlanId: number; finalAmountAgorot: number;
  amountBeforeVatAgorot: number; vatAmountAgorot: number; renewalAmountAgorot: number;
  effectiveAt: string; nextBillingDate: string; quotedAt: string;
  planChangeQuote: string; expiresAt: string;
}

type PlanCardItem =
  | { type: 'module';  key: string; label: string }
  | { type: 'feature'; key: string; label: string };

// Unified display catalog for pricing cards.
// 'module' items check plan.modules (real access-control).
// 'feature' items check plan.features (marketing display benefits).
const PLAN_CARD_ITEMS: PlanCardItem[] = [
  { type: 'module',  key: 'INVOICES',             label: 'הפקת מסמכים' },
  { type: 'module',  key: 'EXPENSES',             label: 'ניהול הוצאות' },
  { type: 'module',  key: 'OPEN_BANKING',         label: 'סנכרון לחשבונות הבנק' },
  { type: 'feature', key: 'SUPPORT', label: 'צ׳אט תמיכה לשאלות מקצועיות' },
];

interface Plan {
  id: number;
  slug: string;
  name: string;
  priceMonthlyAgorot: number;
  licensedDealerPriceMonthlyAgorot: number | null;
  /** Price for the authenticated user's billing business type — computed by the backend. */
  effectivePriceMonthlyAgorot: number;
  effectiveBillingBusinessType: 'LICENSED' | 'EXEMPT';
  currency: string;
  modules: string[];
  features: string[] | null;
  badge: string | null;
  recommended: boolean;
  notes: string | null;
  trialDays: number;
  displayOrder: number;
  isPublic: boolean;
}

export interface FeatureVM {
  key: string;
  label: string;
  included: boolean;
}

export interface PlanVM {
  id: number;
  name: string;
  badge: string | null;
  displayPrice: string;
  notes: string | null;
  features: FeatureVM[];
  recommended: boolean;
}

@Component({
  standalone: true,
  selector: 'app-billing-plans',
  imports: [ProgressSpinner, RouterLink],
  templateUrl: './billing-plans.page.html',
  styleUrl: './billing-plans.page.scss',
})
export class BillingPlansPage implements OnInit {
  readonly billing = inject(BillingStateService);
  private readonly http = inject(HttpClient);
  private readonly genericService = inject(GenericService);

  private readonly rawPlans = signal<Plan[]>([]);
  readonly isLoading = signal(true);
  readonly checkingOutPlanId = signal<number | null>(null);
  readonly planChangePreview = signal<PlanChangePreview | null>(null);
  readonly confirmingChange = signal(false);
  readonly currentPlanId = computed(() => this.billing.billingState()?.plan?.id ?? null);
  readonly selectedPlanName = computed(() => this.rawPlans().find(p => p.id === this.planChangePreview()?.targetPlanId)?.name ?? '');
  readonly pendingChange = computed(() => this.billing.billingState()?.pendingPlanChange ?? null);
  readonly cancelingChange = signal(false);
  readonly amountNowLabel = computed(() => formatShekels(this.planChangePreview()?.finalAmountAgorot ?? 0));
  readonly nextAmountLabel = computed(() => formatShekels(this.planChangePreview()?.renewalAmountAgorot ?? 0));
  readonly effectiveDateLabel = computed(() => formatDate(this.planChangePreview()?.effectiveAt));
  readonly nextDateLabel = computed(() => formatDate(this.planChangePreview()?.nextBillingDate));

  readonly plans = computed<PlanVM[]>(() => {
    return this.rawPlans().map(plan => ({
      id: plan.id,
      name: plan.name,
      badge: plan.badge,
      // Backend resolves this from the user's businesses — never decided on the frontend.
      displayPrice: formatShekels(plan.effectivePriceMonthlyAgorot),
      notes: plan.notes,
      features: PLAN_CARD_ITEMS
        .map(item => ({
          type: item.type,
          key: item.key,
          label: item.label,
          included: item.type === 'module'
            ? plan.modules.includes(item.key)
            : (plan.features ?? []).includes(item.key),
        }))
        // Excluded marketing "feature" rows (e.g. support chat) are an upsell
        // signal for side-by-side comparison shopping. Non-public plans
        // (referral track) are always shown alone — see BillingService.getPlans
        // exclusivity — so there's nothing to compare against; hide the row
        // instead of showing a meaningless X. Module rows (real
        // access-control) always show, public or not.
        .filter(f => plan.isPublic || f.type === 'module' || f.included)
        .map(({ type: _type, ...feature }) => feature),
      recommended: !!plan.recommended,
    }));
  });

  ngOnInit(): void {
    void this.billing.loadBillingState();
    this.loadPlans();
  }

  private async loadPlans(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<Plan[]>(`${environment.apiUrl}billing/plans`)
      );
      this.rawPlans.set(data);
    } catch {
      this.genericService.showToast('שגיאה בטעינת תוכניות המנוי', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  async checkout(planId: number): Promise<void> {
    if (this.checkingOutPlanId() !== null || this.confirmingChange()) return;
    if (this.billing.effectiveStatus() === 'ACTIVE') {
      if (planId === this.currentPlanId() || this.billing.hasBillingOverride()) return;
      this.checkingOutPlanId.set(planId);
      this.planChangePreview.set(null);
      try {
        this.planChangePreview.set(await firstValueFrom(this.http.post<PlanChangePreview>(
          `${environment.apiUrl}billing/checkout/preview`, { planId })));
      } catch (err: any) {
        this.genericService.showToast(err?.error?.message ?? 'לא ניתן לטעון את פירוט שינוי התוכנית', 'error');
      } finally { this.checkingOutPlanId.set(null); }
      return;
    }
    this.checkingOutPlanId.set(planId);
    try {
      const result = await firstValueFrom(
        this.http.post<{ paymentUrl: string; lowProfileId?: string }>(
          `${environment.apiUrl}billing/checkout`,
          { planId },
        )
      );
      sessionStorage.removeItem('tm.checkoutLowProfileId');
      if (result.lowProfileId) sessionStorage.setItem('tm.checkoutLowProfileId', result.lowProfileId);
      window.location.href = result.paymentUrl;
    } catch (err: any) {
      this.genericService.showToast(
        err?.error?.message ?? 'שגיאה בתהליך התשלום. נסה שוב.',
        'error',
      );
      this.checkingOutPlanId.set(null);
    }
  }

  async confirmPlanChange(): Promise<void> {
    const preview = this.planChangePreview();
    if (!preview || this.confirmingChange() || this.billing.hasBillingOverride()) return;
    if (new Date(preview.expiresAt).getTime() <= Date.now()) {
      this.planChangePreview.set(null);
      this.genericService.showToast('הפירוט פג. יש לבחור שוב את התוכנית לקבלת סכום מעודכן.', 'error');
      return;
    }
    this.confirmingChange.set(true);
    try {
      const result = await firstValueFrom(this.http.post<{ paymentUrl?: string; lowProfileId?: string; status?: string }>(
        `${environment.apiUrl}billing/checkout`, { planId: preview.targetPlanId,
          planChangeQuote: preview.planChangeQuote, planChangeQuotedAt: preview.quotedAt }));
      if (result.paymentUrl) {
        sessionStorage.removeItem('tm.checkoutLowProfileId');
        if (result.lowProfileId) sessionStorage.setItem('tm.checkoutLowProfileId', result.lowProfileId);
        window.location.href = result.paymentUrl;
      } else if (result.status === 'SCHEDULED' || result.status === 'APPLIED') {
        this.planChangePreview.set(null);
        await this.billing.refreshBillingState();
        this.genericService.showToast(result.status === 'SCHEDULED' ? 'השנמוך נקבע לחידוש הבא. לא בוצע חיוב כעת.' : 'התוכנית הוחלפה ללא חיוב נוסף.', 'success');
      } else { throw new Error('Unexpected plan change response'); }
    } catch (err: any) {
      this.planChangePreview.set(null);
      this.genericService.showToast(err?.error?.message ?? 'לא ניתן להשלים את שינוי התוכנית. יש לרענן את מצב המנוי לפני ניסיון נוסף.', 'error');
    } finally { this.confirmingChange.set(false); }
  }

  async cancelPendingChange(): Promise<void> {
    const pending = this.pendingChange();
    if (!pending || this.cancelingChange() || this.billing.hasBillingOverride()) return;
    this.cancelingChange.set(true);
    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}billing/plan-change/cancel`, { expectedEventId: pending.eventId }));
      this.planChangePreview.set(null);
      await this.billing.refreshBillingState();
      this.genericService.showToast('בקשת השנמוך בוטלה. התוכנית הנוכחית תמשיך בחידוש הבא.', 'success');
    } catch (err: any) { this.genericService.showToast(err?.error?.message ?? 'לא ניתן לבטל את הבקשה. יש לרענן.', 'error'); }
    finally { this.cancelingChange.set(false); }
  }
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '';
}

function formatShekels(agorot: number): string {
  const shekels = agorot / 100;
  return (shekels % 1 === 0
    ? shekels.toLocaleString('he-IL')
    : shekels.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
