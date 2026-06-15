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

// ─── Promotions ─────────────────────────────────────────────────────────────

export type DiscountType = 'PERCENT' | 'FIXED_AMOUNT' | 'FIXED_PRICE';
export type DurationType = 'ONCE' | 'REPEATING' | 'FOREVER';

export interface AdminPromotion {
  id: number;
  name: string;
  description: string | null;
  discountType: DiscountType;
  /** Used when discountType = PERCENT (0–100). Entity field: discountPercent. */
  discountPercent: number | null;
  /** Used when discountType = FIXED_AMOUNT or FIXED_PRICE. Value in agorot. */
  discountValueAgorot: number | null;
  durationType: DurationType;
  durationMonths: number | null;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  maxRedemptions: number | null;
  /** Read-only — server managed. */
  currentRedemptions: number;
  isActive: boolean;
  appliesToPlanIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionPayload {
  name: string;
  description?: string | null;
  discountType: DiscountType;
  discountPercent?: number | null;
  discountValueAgorot?: number | null;
  durationType: DurationType;
  durationMonths?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
  maxRedemptions?: number | null;
  isActive?: boolean;
  appliesToPlanIds?: number[];
}

export type UpdatePromotionPayload = Partial<CreatePromotionPayload>;

// ─── Coupons ─────────────────────────────────────────────────────────────────

export interface AdminCoupon {
  id: number;
  code: string;
  name: string;
  description: string | null;
  discountType: DiscountType;
  discountPercent: number | null;
  discountValueAgorot: number | null;
  durationType: DurationType;
  durationMonths: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  /** Read-only — server managed. */
  currentRedemptions: number;
  maxRedemptionsPerUser: number;
  isActive: boolean;
  appliesToPlanIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponPayload {
  code: string;
  name: string;
  description?: string | null;
  discountType: DiscountType;
  discountPercent?: number | null;
  discountValueAgorot?: number | null;
  durationType: DurationType;
  durationMonths?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  maxRedemptionsPerUser?: number;
  isActive?: boolean;
  appliesToPlanIds?: number[];
}

export type UpdateCouponPayload = Partial<CreateCouponPayload>;

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
  couponCode: string | null;
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

  // ─── Promotions ─────────────────────────────────────────────────────────────

  getPromotions(): Observable<AdminPromotion[]> {
    return this.http.get<AdminPromotion[]>(`${this.base}/promotions`);
  }

  createPromotion(payload: CreatePromotionPayload): Observable<AdminPromotion> {
    return this.http.post<AdminPromotion>(`${this.base}/promotions`, payload);
  }

  updatePromotion(id: number, payload: UpdatePromotionPayload): Observable<AdminPromotion> {
    return this.http.patch<AdminPromotion>(`${this.base}/promotions/${id}`, payload);
  }

  deactivatePromotion(id: number): Observable<AdminPromotion> {
    return this.http.patch<AdminPromotion>(`${this.base}/promotions/${id}/deactivate`, {});
  }

  activatePromotion(id: number): Observable<AdminPromotion> {
    return this.http.patch<AdminPromotion>(`${this.base}/promotions/${id}/activate`, {});
  }

  // ─── Coupons ─────────────────────────────────────────────────────────────────

  getCoupons(): Observable<AdminCoupon[]> {
    return this.http.get<AdminCoupon[]>(`${this.base}/coupons`);
  }

  createCoupon(payload: CreateCouponPayload): Observable<AdminCoupon> {
    return this.http.post<AdminCoupon>(`${this.base}/coupons`, payload);
  }

  updateCoupon(id: number, payload: UpdateCouponPayload): Observable<AdminCoupon> {
    return this.http.patch<AdminCoupon>(`${this.base}/coupons/${id}`, payload);
  }

  deactivateCoupon(id: number): Observable<AdminCoupon> {
    return this.http.patch<AdminCoupon>(`${this.base}/coupons/${id}/deactivate`, {});
  }

  activateCoupon(id: number): Observable<AdminCoupon> {
    return this.http.patch<AdminCoupon>(`${this.base}/coupons/${id}/activate`, {});
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
