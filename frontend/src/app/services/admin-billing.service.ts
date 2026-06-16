import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

// ─── Plans ─────────────────────────────────────────────────────────────────

export interface AdminPlan {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyAgorot: number;
  currency: string;
  modules: string[] | null;
  trialDays: number;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanPayload {
  slug: string;
  name: string;
  description?: string | null;
  priceMonthlyAgorot: number;
  currency?: string;
  modules?: string[];
  trialDays?: number;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
}

export type UpdatePlanPayload = Partial<CreatePlanPayload>;

// ─── Subscriptions ────────────────────────────────────────────────────────────

export interface AdminSubscription {
  subscriptionId: number;
  firebaseId: string;
  status: string;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  businessId: number | null;
  businessName: string | null;
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  planPriceAgorot: number | null;
  trialEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  gracePeriodEndsAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  createdAt: string;
  cardTokenExists: boolean;
  cardLast4: string | null;
  cardBrand: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  discountPercent: number | null;
  discountAmountAgorot: number | null;
  discountStartDate: string | null;
  discountEndDate: string | null;
}

export interface UpdateSubscriptionDiscountPayload {
  discountPercent?: number | null;
  discountAmountAgorot?: number | null;
  discountStartDate?: string | null;
  discountEndDate?: string | null;
}

export interface AdminSubscriptionDiscountResponse {
  subscriptionId: number;
  discountPercent: number | null;
  discountAmountAgorot: number | null;
  discountStartDate: string | null;
  discountEndDate: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AdminBillingService {
  private readonly base = `${environment.apiUrl}admin/billing`;

  constructor(private readonly http: HttpClient) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  getPlans(): Observable<AdminPlan[]> {
    return this.http.get<AdminPlan[]>(`${this.base}/plans`);
  }

  createPlan(payload: CreatePlanPayload): Observable<AdminPlan> {
    return this.http.post<AdminPlan>(`${this.base}/plans`, payload);
  }

  updatePlan(id: number, payload: UpdatePlanPayload): Observable<AdminPlan> {
    return this.http.patch<AdminPlan>(`${this.base}/plans/${id}`, payload);
  }

  deactivatePlan(id: number): Observable<AdminPlan> {
    return this.http.patch<AdminPlan>(`${this.base}/plans/${id}/deactivate`, {});
  }

  activatePlan(id: number): Observable<AdminPlan> {
    return this.http.patch<AdminPlan>(`${this.base}/plans/${id}/activate`, {});
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  getSubscriptions(): Observable<AdminSubscription[]> {
    return this.http.get<AdminSubscription[]>(`${this.base}/subscriptions`);
  }

  updateSubscriptionDiscount(
    id: number,
    payload: UpdateSubscriptionDiscountPayload,
  ): Observable<AdminSubscriptionDiscountResponse> {
    return this.http.patch<AdminSubscriptionDiscountResponse>(`${this.base}/subscriptions/${id}/discount`, payload);
  }
}
