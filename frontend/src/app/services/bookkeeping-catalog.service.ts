import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { BusinessFieldType } from 'src/app/shared/enums';

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

/** One row of GET bookkeeping/accounts — the "כרטיסים" admin screen. Also
 *  the shape of admin/booking-accounts and .../booking-accounts/catalog's
 *  referenceCards (Form 6111 reference-card project, Phase 2). */
export interface IBookingAccountRow {
  id: number;
  code: string;
  name: string;
  type: string | null;
  sectionId: number | null;
  sectionName: string | null;
  code6111: string | null;
  /** Official Tax Authority Form 6111 category/sub-category names for this
   *  card's code6111 (2026-08-14) — independent of this app's own `name`/
   *  section grouping. NULL together with code6111 on cards with no
   *  official 6111 identity. */
  category6111: string | null;
  subCategory6111: string | null;
  /** A/B/C form-part classification — only ever set on Form 6111 rows
   *  (operational or reference); NULL on everything else (90000-range
   *  technical, personal-deduction cards). */
  formPart: 'A' | 'B' | 'C' | null;
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean | null;
  recognitionType: 'RECOGNIZED' | 'NOT_RECOGNIZED' | 'NOT_APPLICABLE' | null;
  reportScope: 'pnl' | 'annual' | 'technical';
  isActive: boolean;
  ownerType: 'SYSTEM' | 'ACCOUNTANT' | 'CLIENT';
  chartOwnerKey: string;
  accountantId: string | null;
  businessNumber: string | null;
  ownerName: string | null;
  /** Phase 3 Step 3 (2026-08-17, revised model): which business types can
   *  see this card — a VISIBILITY filter independent of ownerType/
   *  chartOwnerKey. Empty = visible to nobody. */
  visibleBusinessTypes: BusinessFieldType[];
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
  /** Phase 3 Step 3: edit which business types see this card. Omit to leave
   *  unchanged; must be non-empty when provided (server rejects an empty
   *  array — clearing visibility via edit isn't allowed, deactivate instead). */
  visibleBusinessTypes?: BusinessFieldType[];
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
  /** Phase 3 Step 3: which business types can see this card — required, at
   *  least one (server rejects an empty array). */
  visibleBusinessTypes: BusinessFieldType[];
}

export type FormPart = 'A' | 'B' | 'C';

/** GET admin/booking-accounts query filters (Form 6111 reference-card
 *  project, Phase 2). isActive omitted = both active + inactive rows. */
export interface IAdminBookingAccountFilters {
  formPart?: FormPart;
  isActive?: boolean;
  search?: string;
}

/** Body shared by both activate endpoints — every field required, no
 *  defaults invented (neither type nor sectionId can be derived from a
 *  reference row: both are NULL on all 321 of them, and the source CSV
 *  never carried either). categoryName is pre-filled by the caller from
 *  the reference row's own name, editable. */
export interface IActivateBookingAccountPayload {
  type: 'expense' | 'income';
  sectionId: number;
  vatPercent: number;
  taxPercent: number;
  reductionPercent: number;
  isEquipment: boolean;
  recognitionType: 'RECOGNIZED' | 'NOT_RECOGNIZED' | 'NOT_APPLICABLE';
  categoryName: string;
  /** Phase 3 Step 3: which business types can see the activated card —
   *  required, at least one (server rejects an empty array — an activated-
   *  but-invisible-to-everyone card would be pointless). */
  visibleBusinessTypes: BusinessFieldType[];
}

/** POST accountant/business/:businessNumber/booking-accounts/activate body
 *  — that route has no :id path segment, so the reference card id travels
 *  in the body instead. */
export interface IActivateClientBookingAccountPayload extends IActivateBookingAccountPayload {
  referenceAccountId: number;
}

export interface IActivatedBookingAccountResult {
  account: {
    id: number; code: string; name: string; type: string;
    sectionId: number | null; code6111: string | null;
    vatPercent: number; taxPercent: number; reductionPercent: number;
    isEquipment: boolean; recognitionType: string; reportScope: string;
    ownerType: string; chartOwnerKey: string;
    visibleBusinessTypes: BusinessFieldType[];
  };
  subCategory: { id: number; name: string; categoryId: number; ownerType: string; chartOwnerKey: string; approvalStatus: string } | null;
}

/** One row of a 409 deactivate-blocked response's blockingSubCategories. */
export interface IBlockingSubCategory {
  id: number;
  name: string;
  chartOwnerKey: string;
}

/** One row of GET accountant/business/:businessNumber/booking-accounts/
 *  catalog's `subCategories` — the business's effective merged expense
 *  catalog (AccountantBookingAccountsController.getCatalog's own mapping,
 *  not the same shape as ICatalogOverviewSubCategory above). */
export interface IAccountantEffectiveSubCategory {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string | null;
  accountId: number | null;
  isPrivate: boolean;
  approvalStatus: string;
  ownerType: 'SYSTEM' | 'ACCOUNTANT' | 'CLIENT';
  accountCode: string | null;
  accountName: string | null;
}

/** GET accountant/business/:businessNumber/booking-accounts/catalog
 *  response — (a) the business's current effective catalog, (b) the
 *  browsable Form 6111 reference catalog to activate a card from, (c) —
 *  since 2026-08-17 — the business's own active CLIENT/ACCOUNTANT-owned
 *  cards, full IBookingAccountRow shape, editable/deactivatable; SYSTEM rows
 *  never appear here. */
export interface IAccountantBookingAccountsCatalog {
  categories: { id: number; name: string; type: 'EXPENSE' | 'INCOME' }[];
  subCategories: IAccountantEffectiveSubCategory[];
  referenceCards: IBookingAccountRow[];
  ownedAccounts: IBookingAccountRow[];
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

  // ==========================================================================
  // Form 6111 reference-card project, Phase 2 (2026-08-14) — admin/booking-
  // accounts and accountant/business/:businessNumber/booking-accounts.
  // Separate routes from GET/PATCH bookkeeping/accounts above (which this
  // service still owns for the older "כרטיסים" admin screen), but same
  // backend CatalogService underneath — no logic duplicated on the server,
  // and these methods here follow the exact same client-side shape.
  // ==========================================================================

  /** All chartOwnerKey='SYSTEM' rows (68 operational + 321 reference),
   *  admin-only. isActive omitted = both. */
  listAdminBookingAccounts(filters: IAdminBookingAccountFilters = {}): Observable<IBookingAccountRow[]> {
    const url = `${environment.apiUrl}admin/booking-accounts`;
    let params = new HttpParams();
    if (filters.formPart) params = params.set('formPart', filters.formPart);
    if (filters.isActive !== undefined) params = params.set('isActive', String(filters.isActive));
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    return this.http.get<IBookingAccountRow[]>(url, { params });
  }

  /** Edit an already-active operational SYSTEM card (admin-only; refuses
   *  '6111-%' reference rows — those are activated, not patched). */
  updateAdminBookingAccount(id: number, dto: IUpdateAccountPayload): Observable<IBookingAccountRow> {
    const url = `${environment.apiUrl}admin/booking-accounts/${id}`;
    return this.http.patch<IBookingAccountRow>(url, dto);
  }

  /** Turn a reference card into a real SYSTEM operational card + paired
   *  sub_category, one atomic call (admin-only). */
  activateAdminBookingAccount(id: number, payload: IActivateBookingAccountPayload): Observable<IActivatedBookingAccountResult> {
    const url = `${environment.apiUrl}admin/booking-accounts/${id}/activate`;
    return this.http.post<IActivatedBookingAccountResult>(url, payload);
  }

  /** Deactivate an already-active SYSTEM card (admin-only). Rejects (409)
   *  with `{ message, blockingSubCategories }` in the error body if any
   *  active sub_category, in any chartOwnerKey, still points at it. */
  deactivateAdminBookingAccount(id: number): Observable<IBookingAccountRow> {
    const url = `${environment.apiUrl}admin/booking-accounts/${id}/deactivate`;
    return this.http.patch<IBookingAccountRow>(url, {});
  }

  /** (a) the business's current effective catalog, (b) the browsable Form
   *  6111 reference catalog an accountant can activate a card from for this
   *  client (accountant-only, delegation-checked). */
  getAccountantBookingAccountsCatalog(businessNumber: string): Observable<IAccountantBookingAccountsCatalog> {
    const url = `${environment.apiUrl}accountant/business/${encodeURIComponent(businessNumber)}/booking-accounts/catalog`;
    return this.http.get<IAccountantBookingAccountsCatalog>(url);
  }

  /** Activate a reference card into a CLIENT-owned card for this business
   *  (accountant-only, delegation-checked). */
  activateAccountantBookingAccount(
    businessNumber: string,
    payload: IActivateClientBookingAccountPayload,
  ): Observable<IActivatedBookingAccountResult> {
    const url = `${environment.apiUrl}accountant/business/${encodeURIComponent(businessNumber)}/booking-accounts/activate`;
    return this.http.post<IActivatedBookingAccountResult>(url, payload);
  }

  /** Edit a card this accountant owns for this business (CLIENT_<business>
   *  or their own ACCOUNTANT_<agentId>) — server rejects (404, ownership
   *  not leaked) anything else, SYSTEM rows included. */
  updateAccountantBookingAccount(businessNumber: string, id: number, dto: IUpdateAccountPayload): Observable<IBookingAccountRow> {
    const url = `${environment.apiUrl}accountant/business/${encodeURIComponent(businessNumber)}/booking-accounts/${id}`;
    return this.http.patch<IBookingAccountRow>(url, dto);
  }

  /** Same shared-impact count as getAccountUsage, scoped to a card this
   *  accountant owns for this business. */
  getAccountantBookingAccountUsage(businessNumber: string, id: number): Observable<IAccountUsage> {
    const url = `${environment.apiUrl}accountant/business/${encodeURIComponent(businessNumber)}/booking-accounts/${id}/usage`;
    return this.http.get<IAccountUsage>(url);
  }

  /** Deactivate a card this accountant owns for this business. Rejects
   *  (409) with `{ message, blockingSubCategories }` the same way the admin
   *  route does if any active sub_category still points at it. */
  deactivateAccountantBookingAccount(businessNumber: string, id: number): Observable<IBookingAccountRow> {
    const url = `${environment.apiUrl}accountant/business/${encodeURIComponent(businessNumber)}/booking-accounts/${id}/deactivate`;
    return this.http.patch<IBookingAccountRow>(url, {});
  }
}
