import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface OpenBankingEnrollmentOptions {
  plans: { id: number; name: string; amountAgorot: number; quote: string; currency: string }[];
  nonBankingPlans: { id: number; name: string }[];
  trialEnd: string | null;
  status: string;
  hasSavedCard: boolean;
  complimentary: boolean;
  enrollment: { eventId: number; planId: number; status: 'PREPARE' | 'READY'; firstBillingAt: string } | null;
}
@Injectable({ providedIn: 'root' })
export class OpenBankingEnrollmentService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}billing/open-banking/enrollment`;
  options() { return firstValueFrom(this.http.get<OpenBankingEnrollmentOptions>(this.url)); }
  prepare(planId: number, quote: string) { return firstValueFrom(this.http.post(this.url, { planId, quote })); }
  cancel(expectedEventId: number, planId: number) { return firstValueFrom(this.http.post(`${this.url}/cancel`, { expectedEventId, planId })); }
}
