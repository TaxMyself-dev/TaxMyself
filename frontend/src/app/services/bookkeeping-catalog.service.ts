import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

/** One row of GET bookkeeping/catalog-overview (Phase 5.4). */
export interface ICatalogOverviewSubCategory {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string | null;
  ownerType: 'SYSTEM' | 'ACCOUNTANT' | 'CLIENT';
  chartOwnerKey: string;
  isPrivate: boolean;
  reportScope: string | null;
  approvalStatus: string;
  accountId: number | null;
  accountCode: string | null;
  accountName: string | null;
  sectionName: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean | null;
  recognitionType: string | null;
  isEffective: boolean;
}

export interface ICatalogOverviewCategory {
  id: number;
  name: string;
  type: 'EXPENSE' | 'INCOME';
  ownerType: 'SYSTEM' | 'ACCOUNTANT' | 'CLIENT';
  chartOwnerKey: string;
  isEffective: boolean;
}

export interface ICatalogOverview {
  categories: ICatalogOverviewCategory[];
  subCategories: ICatalogOverviewSubCategory[];
}

/** One queue row of GET bookkeeping/pending-approvals (Phase 5.4). */
export interface IPendingApproval {
  subCategoryId: number;
  subCategoryName: string;
  categoryId: number;
  categoryName: string | null;
  approvalStatus: string;
  clientUserId: string | null;
  businessNumber: string | null;
  pendingExpenseCount: number;
}

export interface IAccountingSectionOption {
  id: number;
  code: string;
  name: string;
}

/** One row of GET bookkeeping/accounts — the "כרטיסים" admin screen. */
export interface IBookingAccountRow {
  id: number;
  code: string;
  name: string;
  type: string;
  sectionId: number | null;
  sectionName: string | null;
  code6111: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean | null;
  recognitionType: 'RECOGNIZED' | 'NOT_RECOGNIZED' | 'NOT_APPLICABLE' | null;
  reportScope: 'pnl' | 'annual' | 'technical';
  ownerType: 'SYSTEM' | 'ACCOUNTANT' | 'CLIENT';
  chartOwnerKey: string;
  accountantId: string | null;
  businessNumber: string | null;
  ownerName: string | null;
}

/** GET bookkeeping/accounts/:id/usage — impact count before editing a shared card. */
export interface IAccountUsage {
  subCategoryCount: number;
  businessCount: number;
}

/** PATCH bookkeeping/accounts/:id payload — direct in-place card edit. */
export interface IUpdateAccountPayload {
  name?: string;
  code?: string;
  sectionId?: number;
  code6111?: string | null;
  recognitionType?: 'RECOGNIZED' | 'NOT_RECOGNIZED' | 'NOT_APPLICABLE';
  vatPercent?: number;
  taxPercent?: number;
  reductionPercent?: number;
  isEquipment?: boolean;
  reportScope?: 'pnl' | 'annual' | 'technical';
}

/** POST bookkeeping/accounts payload (D11). */
export interface ICreateAccountPayload {
  name: string;
  code?: string;
  sectionId: number;
  code6111?: string | null;
  recognitionType?: 'RECOGNIZED' | 'NOT_RECOGNIZED';
  vatPercent: number;
  taxPercent: number;
  reductionPercent?: number;
  isEquipment?: boolean;
  availableFor: 'ALL_MY_CLIENTS' | 'CURRENT_CLIENT';
  technicalOnly?: boolean;
  categoryName?: string;
  type?: 'expense' | 'income';
  businessNumber?: string;
}

/**
 * Accountant-facing catalog management (Phase 6.2, backend Phase 5.4/5.2).
 * Requests that must run in a CLIENT's catalog context (overview, current-
 * client account creation) send `x-client-user-id` per-request — the guard
 * enforces the ACTIVE delegation. This header is safe to set here because
 * the auth interceptor only writes it while view-as mode is active, which
 * the clients panel is not.
 */
@Injectable({ providedIn: 'root' })
export class BookkeepingCatalogService {
  constructor(private http: HttpClient) {}

  private clientHeaders(clientUserId?: string): HttpHeaders | undefined {
    return clientUserId ? new HttpHeaders({ 'x-client-user-id': clientUserId }) : undefined;
  }

  /** All catalog rows visible to the client (three layers, uncollapsed). */
  getCatalogOverview(businessNumber: string, clientUserId?: string): Observable<ICatalogOverview> {
    const url = `${environment.apiUrl}bookkeeping/catalog-overview`;
    const params = new HttpParams().set('businessNumber', businessNumber);
    return this.http.get<ICatalogOverview>(url, { params, headers: this.clientHeaders(clientUserId) });
  }

  /** The acting accountant's pending-approvals queue across all clients. */
  getPendingApprovals(): Observable<IPendingApproval[]> {
    const url = `${environment.apiUrl}bookkeeping/pending-approvals`;
    return this.http.get<IPendingApproval[]>(url);
  }

  /** Sections for the D11 add-account form. */
  getSections(): Observable<IAccountingSectionOption[]> {
    const url = `${environment.apiUrl}bookkeeping/sections`;
    return this.http.get<IAccountingSectionOption[]>(url);
  }

  /** D11 add-account. CURRENT_CLIENT must carry the client's user id (the
   *  delegation-checked impersonation context) and businessNumber. */
  createAccount(payload: ICreateAccountPayload, clientUserId?: string): Observable<any> {
    const url = `${environment.apiUrl}bookkeeping/accounts`;
    return this.http.post<any>(url, payload, { headers: this.clientHeaders(clientUserId) });
  }

  /** "כרטיסים" admin screen (Session 13): every card, optionally filtered by
   *  owner scope. Admin-only on the backend. */
  listAccounts(ownerType?: 'SYSTEM' | 'ACCOUNTANT' | 'CLIENT'): Observable<IBookingAccountRow[]> {
    const url = `${environment.apiUrl}bookkeeping/accounts`;
    const params = ownerType ? new HttpParams().set('ownerType', ownerType) : undefined;
    return this.http.get<IBookingAccountRow[]>(url, { params });
  }

  /** Impact count shown before editing a shared card — "N sub_categories
   *  across M businesses point at this". */
  getAccountUsage(id: number): Observable<IAccountUsage> {
    const url = `${environment.apiUrl}bookkeeping/accounts/${id}/usage`;
    return this.http.get<IAccountUsage>(url);
  }

  /** Direct in-place edit of an existing card's own fields (admin-only). */
  updateAccount(id: number, dto: IUpdateAccountPayload): Observable<IBookingAccountRow> {
    const url = `${environment.apiUrl}bookkeeping/accounts/${id}`;
    return this.http.patch<IBookingAccountRow>(url, dto);
  }
}
