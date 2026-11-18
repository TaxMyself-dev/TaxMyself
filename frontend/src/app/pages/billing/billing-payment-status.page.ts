import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BillingStateService, CheckoutResolutionStatus } from '../../services/billing-state.service';

@Component({
  standalone: true,
  selector: 'app-billing-payment-status',
  templateUrl: './billing-payment-status.page.html',
  styleUrl: './billing-payment-status.page.scss',
})
export class BillingPaymentStatusPage implements OnInit {
  readonly checking = signal(true);
  readonly delayed = signal(false);
  readonly terminal = signal<'DECLINED' | 'REVIEW' | 'SUCCESS_BLOCKED' | null>(null);
  readonly flow = signal<'PLANS' | 'RECOVERY'>('PLANS');
  private readonly billing = inject(BillingStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = Date.now();
  private lowProfileId: string | null = null;
  private stopped = false;

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.lowProfileId = params.get('lowProfileId') ?? params.get('lowprofilecode') ??
      params.get('LowProfileCode') ?? sessionStorage.getItem('tm.checkoutLowProfileId');
    if (this.lowProfileId) sessionStorage.setItem('tm.checkoutLowProfileId', this.lowProfileId);
    this.destroyRef.onDestroy(() => {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
    });
    void this.checkNow();
  }

  async checkNow(): Promise<void> {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.checking.set(true);
    try {
      const result = await this.billing.getCheckoutResolution(this.lowProfileId);
      await this.applyResult(result);
    } catch {
      this.delayed.set(true);
      this.scheduleNext();
    } finally {
      this.checking.set(false);
    }
  }

  private async applyResult(result: CheckoutResolutionStatus): Promise<void> {
    this.flow.set(result.flow);
    if (result.lowProfileId) {
      this.lowProfileId = result.lowProfileId;
      sessionStorage.setItem('tm.checkoutLowProfileId', result.lowProfileId);
    }
    if (result.status === 'COMPLETED') {
      sessionStorage.removeItem('tm.checkoutLowProfileId');
      this.billing.setCheckoutReturnContext(null);
      await this.billing.refreshBillingState();
      if (!this.billing.isPaymentRequired()) {
        await this.router.navigate(['/my-account'], { replaceUrl: true });
      } else {
        this.terminal.set('SUCCESS_BLOCKED');
      }
      return;
    }
    if (result.status === 'DECLINED' || result.status === 'NONE') {
      sessionStorage.removeItem('tm.checkoutLowProfileId');
      await this.billing.refreshBillingState();
      this.terminal.set('DECLINED');
      return;
    }
    if (result.status === 'REVIEW') {
      this.terminal.set('REVIEW');
      return;
    }
    if (Date.now() - this.startedAt >= 90_000) this.delayed.set(true);
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.stopped || this.terminal()) return;
    const delay = this.delayed() ? 15_000 : 3_000;
    this.timer = setTimeout(() => void this.checkNow(), delay);
  }

  continueAfterDecline(): void {
    void this.router.navigate([this.flow() === 'RECOVERY' ? '/billing/recovery' : '/billing/plans'], {
      replaceUrl: true,
      queryParams: { payment: 'declined' },
    });
  }
}
