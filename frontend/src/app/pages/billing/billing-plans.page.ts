import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { GenericService } from '../../services/generic.service';
import { ProgressSpinner } from 'primeng/progressspinner';

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
  imports: [ProgressSpinner],
  templateUrl: './billing-plans.page.html',
  styleUrl: './billing-plans.page.scss',
})
export class BillingPlansPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly genericService = inject(GenericService);

  private readonly rawPlans = signal<Plan[]>([]);
  readonly isLoading = signal(true);
  readonly checkingOutPlanId = signal<number | null>(null);

  readonly plans = computed<PlanVM[]>(() => {
    return this.rawPlans().map(plan => ({
      id: plan.id,
      name: plan.name,
      badge: plan.badge,
      // Backend resolves this from the user's businesses — never decided on the frontend.
      displayPrice: formatShekels(plan.effectivePriceMonthlyAgorot),
      notes: plan.notes,
      features: PLAN_CARD_ITEMS.map(item => ({
        key: item.key,
        label: item.label,
        included: item.type === 'module'
          ? plan.modules.includes(item.key)
          : (plan.features ?? []).includes(item.key),
      })),
      recommended: !!plan.recommended,
    }));
  });

  ngOnInit(): void {
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
    if (this.checkingOutPlanId() !== null) return;
    this.checkingOutPlanId.set(planId);
    try {
      const result = await firstValueFrom(
        this.http.post<{ paymentUrl: string }>(
          `${environment.apiUrl}billing/checkout`,
          { planId },
        )
      );
      window.location.href = result.paymentUrl;
    } catch (err: any) {
      this.genericService.showToast(
        err?.error?.message ?? 'שגיאה בתהליך התשלום. נסה שוב.',
        'error',
      );
      this.checkingOutPlanId.set(null);
    }
  }
}

function formatShekels(agorot: number): string {
  const shekels = agorot / 100;
  return (shekels % 1 === 0
    ? shekels.toLocaleString('he-IL')
    : shekels.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
