/**
 * Mirrors backend ModuleName enum exactly.
 * Values must stay in sync with backend/src/enum.ts > ModuleName.
 */
export enum ModuleName {
  INVOICES = 'INVOICES',
  EXPENSES = 'EXPENSES',
  OPEN_BANKING = 'OPEN_BANKING',
  ACCOUNTANT = 'ACCOUNTANT',
}

/** How the UI should react when a feature or route is not accessible. */
export enum BlockedBehavior {
  /** Remove the element from the DOM entirely. */
  HIDE = 'HIDE',
  /** Show an upgrade/upsell popup when the user tries to interact. */
  UPGRADE_POPUP = 'UPGRADE_POPUP',
  /** Render the element but in a visually disabled/locked state. */
  DISABLE = 'DISABLE',
}

/** Logical identifiers for protected application routes. */
export enum AppRoute {
  BOOK_KEEPING_INCOMES        = 'BOOK_KEEPING_INCOMES',
  BOOK_KEEPING_EXPENSES       = 'BOOK_KEEPING_EXPENSES',
  TRANSACTIONS                = 'TRANSACTIONS',
  FLOW_ANALYSIS               = 'FLOW_ANALYSIS',
  VAT_REPORT                  = 'VAT_REPORT',
  PNL_REPORT                  = 'PNL_REPORT',
  ADVANCE_INCOME_TAX_REPORT   = 'ADVANCE_INCOME_TAX_REPORT',
  UNIFORM_FILE                = 'UNIFORM_FILE',
  DOC_CREATE                  = 'DOC_CREATE',
}

/**
 * Maps each AppRoute to its Angular router path string.
 * Use this when you need the actual URL (e.g. routerLink, Router.navigate).
 */
export const APP_ROUTE_PATHS: Record<AppRoute, string> = {
  [AppRoute.BOOK_KEEPING_INCOMES]:        '/book-keeping/incomes',
  [AppRoute.BOOK_KEEPING_EXPENSES]:       '/book-keeping/expenses',
  [AppRoute.TRANSACTIONS]:                '/transactions',
  [AppRoute.FLOW_ANALYSIS]:               '/flow-analysis',
  [AppRoute.VAT_REPORT]:                  '/vat-report',
  [AppRoute.PNL_REPORT]:                  '/pnl-report',
  [AppRoute.ADVANCE_INCOME_TAX_REPORT]:   '/advance-income-tax-report',
  [AppRoute.UNIFORM_FILE]:                '/uniform-file',
  [AppRoute.DOC_CREATE]:                  '/doc-create',
};

/** Per-route access requirement — stored in ROUTE_ACCESS_CONFIG and read by ModuleAccessGuard. */
export interface RouteAccessEntry {
  requiredModule: ModuleName;
  /**
   * What the guard does when the user cannot access this route.
   * UPGRADE_POPUP → redirect to /my-account and open the upgrade popup.
   * HIDE / DISABLE → redirect to /my-account silently.
   */
  blockedBehavior: BlockedBehavior;
  /** Hebrew user-facing label shown in the upgrade popup title. */
  displayName: string;
}

/**
 * Single source of truth for route-level module requirements and block behavior.
 * ModuleAccessGuard reads this; all features using relatedRoute derive their
 * module from it via AccessService.canAccessRoute().
 */
export const ROUTE_ACCESS_CONFIG: Record<AppRoute, RouteAccessEntry> = {
  [AppRoute.BOOK_KEEPING_INCOMES]:        { requiredModule: ModuleName.INVOICES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'ספר חשבונות - הכנסות' },
  [AppRoute.BOOK_KEEPING_EXPENSES]:       { requiredModule: ModuleName.EXPENSES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'ספר חשבונות - הוצאות' },
  [AppRoute.TRANSACTIONS]:                { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'תזרים' },
  [AppRoute.FLOW_ANALYSIS]:               { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'ניתוח תזרים' },
  [AppRoute.VAT_REPORT]:                  { requiredModule: ModuleName.INVOICES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'דוח מע"מ' },
  [AppRoute.PNL_REPORT]:                  { requiredModule: ModuleName.INVOICES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'דוח רווח והפסד' },
  [AppRoute.ADVANCE_INCOME_TAX_REPORT]:   { requiredModule: ModuleName.INVOICES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'מקדמת מס הכנסה' },
  [AppRoute.UNIFORM_FILE]:                { requiredModule: ModuleName.INVOICES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'קובץ אחיד' },
  [AppRoute.DOC_CREATE]:                  { requiredModule: ModuleName.INVOICES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'הפקת מסמך' },
};

/** UI-level feature identifiers used as keys in FEATURE_ACCESS_CONFIG. */
export enum AppFeature {
  // ── INVOICES ─────────────────────────────────────────────────────────────
  DOCUMENTS_LIST_TAB                  = 'DOCUMENTS_LIST_TAB',
  DOC_CREATE_BUTTON_PIVOT             = 'DOC_CREATE_BUTTON_PIVOT',
  DOC_CREATE_BUTTON_RECOMMENDED_PIVOT = 'DOC_CREATE_BUTTON_RECOMMENDED_PIVOT',

  // ── EXPENSES ─────────────────────────────────────────────────────────────
  EXPENSES_LIST_TAB  = 'EXPENSES_LIST_TAB',
  ADD_EXPENSE_BUTTON = 'ADD_EXPENSE_BUTTON',

  // ── OPEN_BANKING ─────────────────────────────────────────────────────────
  TRANSACTIONS_TAB_PIVOT                = 'TRANSACTIONS_TAB_PIVOT',
  TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT = 'TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT',
  FLOW_ANALYSIS_TAB_PIVOT               = 'FLOW_ANALYSIS_TAB_PIVOT',
  ADD_OPEN_BANKING_BUTTON               = 'ADD_OPEN_BANKING_BUTTON',
  OPEN_BANKING_TABLE                    = 'OPEN_BANKING_TABLE',
  OPEN_BANKING_CONNECT                  = 'OPEN_BANKING_CONNECT',
  CATEGORY_LIST_TAB                     = 'CATEGORY_LIST_TAB',
  OPEN_BANKING_PERMISSIONS_TAB          = 'OPEN_BANKING_PERMISSIONS_TAB',
}

/**
 * Per-feature access configuration.
 * Exactly one of requiredModule or relatedRoute must be set — AccessService validates this at startup.
 *
 * - requiredModule: for action features (buttons, inline actions) — module checked directly.
 * - relatedRoute:   for navigation features (tabs, cards, menu items) — module derived from
 *                   ROUTE_ACCESS_CONFIG so it stays in sync automatically.
 *
 * Note: blockedBehavior here controls the UI element behavior.
 * Route-level blocked behavior (for direct URL navigation) is set separately in ROUTE_ACCESS_CONFIG.
 */
export interface FeatureAccessConfig {
  requiredModule?: ModuleName;
  relatedRoute?: AppRoute;
  blockedBehavior: BlockedBehavior;
  /** Hebrew user-facing label shown in the upgrade popup title. */
  displayName: string;
}

export const FEATURE_ACCESS_CONFIG: Record<AppFeature, FeatureAccessConfig> = {
  // ── Route features (navigation / menu items / cards) ───────────────────
  [AppFeature.TRANSACTIONS_TAB_PIVOT]:                  { relatedRoute: AppRoute.TRANSACTIONS,  blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'תזרים' },
  [AppFeature.TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT]:   { relatedRoute: AppRoute.TRANSACTIONS,  blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'תזרים' },
  [AppFeature.FLOW_ANALYSIS_TAB_PIVOT]:                 { relatedRoute: AppRoute.FLOW_ANALYSIS, blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'ניתוח תזרים' },
  [AppFeature.DOC_CREATE_BUTTON_PIVOT]:                 { relatedRoute: AppRoute.DOC_CREATE,    blockedBehavior: BlockedBehavior.UPGRADE_POPUP,          displayName: 'הפקת מסמך' },
  [AppFeature.DOC_CREATE_BUTTON_RECOMMENDED_PIVOT]:     { relatedRoute: AppRoute.DOC_CREATE,    blockedBehavior: BlockedBehavior.UPGRADE_POPUP,       displayName: 'הפקת מסמך' },

  // ── Action features (buttons / inline actions) ─────────────────────────
  [AppFeature.ADD_EXPENSE_BUTTON]:           { requiredModule: ModuleName.EXPENSES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'הוספת הוצאה' },
  [AppFeature.EXPENSES_LIST_TAB]:            { requiredModule: ModuleName.EXPENSES,     blockedBehavior: BlockedBehavior.HIDE,          displayName: 'רשימת הוצאות' },
  [AppFeature.OPEN_BANKING_CONNECT]:         { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.UPGRADE_POPUP, displayName: 'חיבור בנקאות פתוחה' },
  [AppFeature.DOCUMENTS_LIST_TAB]:           { requiredModule: ModuleName.INVOICES,     blockedBehavior: BlockedBehavior.HIDE,          displayName: 'רשימת מסמכים' },
  [AppFeature.ADD_OPEN_BANKING_BUTTON]:      { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE,          displayName: 'הוספת חשבון בנק' },
  [AppFeature.OPEN_BANKING_TABLE]:           { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE,          displayName: 'טבלת בנקאות פתוחה' },
  [AppFeature.CATEGORY_LIST_TAB]:            { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE,          displayName: 'רשימת קטגוריות' },
  [AppFeature.OPEN_BANKING_PERMISSIONS_TAB]: { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE,          displayName: 'הרשאות בנקאות פתוחה' },
};

/** Returned by AccessHandlerService — describes whether access was granted and why it was blocked. */
export interface AccessResult {
  allowed: boolean;
  /** Present only when allowed is false. */
  blockedBehavior?: BlockedBehavior;
}
