import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { BillingStateService } from '../../services/billing-state.service';

@Component({
  standalone: true,
  selector: 'app-billing-recovery',
  template: `
    <main dir="rtl" class="recovery">
      <h1>הסדרת התשלום</h1>
      @if (loading()) { <p role="status">טוענים את פרטי החוב…</p> }
      @else if (error()) { <p role="alert">{{ error() }}</p> }
      @else {
        <p>תשלום החוב עבור תוכנית {{ billing.billingState()?.plan?.name }}</p>
        <p>סכום לתשלום: <strong>{{ amountLabel() }} ₪ כולל מע״מ</strong></p>
        <p>הכרטיס שבו תשלמו יישמר לחיובי המנוי הבאים ויחליף את הכרטיס הקודם.</p>
        <p>התשלום יתבצע במסך המאובטח של CardCom. המנוי יופעל לאחר אימות התשלום במערכת.</p>
        <button type="button" [disabled]="submitting()" (click)="pay()">
          {{ submitting() ? 'פותחים מסך תשלום…' : 'לתשלום החוב ושמירת הכרטיס' }}
        </button>
      }
    </main>`,
  styles: [`.recovery { max-width: 560px; margin: 48px auto; padding: 24px; }
    button { padding: 12px 20px; cursor: pointer; }`],
})
export class BillingRecoveryPage implements OnInit {
  readonly billing = inject(BillingStateService);
  private readonly http = inject(HttpClient);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly amountLabel = signal('');
  private planId: number | null = null;

  ngOnInit(): void { void this.load(); }

  private async load(): Promise<void> {
    try {
      await this.billing.loadBillingState();
      const state = this.billing.billingState();
      if (state?.subscription?.status !== 'PAST_DUE' || !state.plan || this.billing.hasBillingOverride()) {
        this.error.set('אין חוב זמין להסדרה בחשבון זה.');
        return;
      }
      this.planId = state.plan.id;
      const preview = await firstValueFrom(this.http.post<{ finalAmountAgorot: number; currency: string }>(
        `${environment.apiUrl}billing/checkout/preview`, { planId: this.planId },
      ));
      if (preview.currency !== 'ILS') throw new Error('Unsupported currency');
      this.amountLabel.set((preview.finalAmountAgorot / 100).toLocaleString('he-IL', { minimumFractionDigits: 2 }));
    } catch { this.error.set('לא ניתן לטעון את פרטי החוב. יש לרענן את העמוד או לפנות לתמיכה.'); }
    finally { this.loading.set(false); }
  }

  async pay(): Promise<void> {
    if (this.submitting() || this.loading() || this.error() || !this.planId) return;
    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.http.post<{ paymentUrl: string }>(
        `${environment.apiUrl}billing/checkout`, { planId: this.planId, recoveryOnly: true },
      ));
      window.location.href = result.paymentUrl;
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'לא ניתן לפתוח תשלום. יש לפנות לתמיכה לפני ניסיון נוסף.');
      this.submitting.set(false);
    }
  }
}
