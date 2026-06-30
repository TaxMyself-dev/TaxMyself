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
  [AppRoute.DOC_CREATE]:                  '/doc-create'
};

/**
 * Maps each protected route to the module required to access it.
 * Update here when a route's module requirement changes — all features
 * referencing that route via relatedRoute will automatically follow.
 */
export const ROUTE_ACCESS_CONFIG: Record<AppRoute, ModuleName> = {
  [AppRoute.BOOK_KEEPING_INCOMES]:        ModuleName.INVOICES,
  [AppRoute.BOOK_KEEPING_EXPENSES]:       ModuleName.EXPENSES,
  [AppRoute.TRANSACTIONS]:                ModuleName.OPEN_BANKING,
  [AppRoute.FLOW_ANALYSIS]:               ModuleName.OPEN_BANKING,
  [AppRoute.VAT_REPORT]:                  ModuleName.INVOICES,
  [AppRoute.PNL_REPORT]:                  ModuleName.INVOICES,
  [AppRoute.ADVANCE_INCOME_TAX_REPORT]:   ModuleName.INVOICES,
  [AppRoute.UNIFORM_FILE]:                ModuleName.INVOICES,
  [AppRoute.DOC_CREATE]:                  ModuleName.INVOICES,
};

/** UI-level feature identifiers used as keys in FEATURE_ACCESS_CONFIG. */
export enum AppFeature {
  // ── INVOICES ─────────────────────────────────────────────────────────────
  DOCUMENTS_LIST_TAB = 'DOCUMENTS_LIST_TAB',
  DOC_CREATE_BUTTON_PIVOT = 'DOC_CREATE_BUTTON_PIVOT',
  DOC_CREATE_BUTTON_RECOMMENDED_PIVOT = 'DOC_CREATE_BUTTON_RECOMMENDED_PIVOT',

  // ── EXPENSES ─────────────────────────────────────────────────────────────
  EXPENSES_LIST_TAB = 'EXPENSES_LIST_TAB',
  ADD_EXPENSE_BUTTON = 'ADD_EXPENSE_BUTTON',
  // VAT_REPORT = 'VAT_REPORT',
  // PNL_REPORT = 'PNL_REPORT',
  // ADVANCE_INCOME_TAX_REPORT = 'ADVANCE_INCOME_TAX_REPORT',

  // ── OPEN_BANKING ─────────────────────────────────────────────────────────
  TRANSACTIONS_TAB_PIVOT = 'TRANSACTIONS_TAB_PIVOT',
  TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT = 'TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT',
  FLOW_ANALYSIS_TAB_PIVOT = 'FLOW_ANALYSIS_TAB_PIVOT',
  ADD_OPEN_BANKING_BUTTON = 'ADD_OPEN_BANKING_BUTTON',
  OPEN_BANKING_TABLE = 'OPEN_BANKING_TABLE',
  OPEN_BANKING_CONNECT = 'OPEN_BANKING_CONNECT',
  CATEGORY_LIST_TAB = 'CATEGORY_LIST_TAB',
  OPEN_BANKING_PERMISSIONS_TAB = 'OPEN_BANKING_PERMISSIONS_TAB'
}

/** How the UI should react when a feature is not accessible. */
export enum BlockedBehavior {
  /** Remove the element from the DOM entirely. */
  HIDE = 'HIDE',
  /** Show an upgrade/upsell popup when the user tries to interact. */
  UPGRADE_POPUP = 'UPGRADE_POPUP',
  /** Render the element but in a visually disabled/locked state. */
  DISABLE = 'DISABLE',
}

/**
 * Per-feature access configuration.
 *
 * Exactly one of requiredModule or relatedRoute must be set — never both,
 * never neither. AccessService validates this at startup.
 *
 * - Use requiredModule for action features (buttons, inline actions).
 * - Use relatedRoute for navigation features (menu items, cards, tabs).
 *   The module requirement is then derived from ROUTE_ACCESS_CONFIG so
 *   it stays in sync automatically.
 */
export interface FeatureAccessConfig {
  requiredModule?: ModuleName;
  relatedRoute?: AppRoute;
  blockedBehavior: BlockedBehavior;
}

export const FEATURE_ACCESS_CONFIG: Record<AppFeature, FeatureAccessConfig> = {
  // ── Route features (navigation / menu items / cards) ───────────────────
  [AppFeature.TRANSACTIONS_TAB_PIVOT]:             { relatedRoute: AppRoute.TRANSACTIONS,      blockedBehavior: BlockedBehavior.UPGRADE_POPUP },
  [AppFeature.TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT]:              { relatedRoute: AppRoute.TRANSACTIONS,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP },
  [AppFeature.FLOW_ANALYSIS_TAB_PIVOT]:               { relatedRoute: AppRoute.FLOW_ANALYSIS,              blockedBehavior: BlockedBehavior.UPGRADE_POPUP },
  [AppFeature.DOC_CREATE_BUTTON_PIVOT]:               { relatedRoute: AppRoute.DOC_CREATE,              blockedBehavior: BlockedBehavior.HIDE },
  [AppFeature.DOC_CREATE_BUTTON_RECOMMENDED_PIVOT]:               { relatedRoute: AppRoute.DOC_CREATE,              blockedBehavior: BlockedBehavior.DISABLE },

  // ── Action features (buttons / inline actions) ─────────────────────────
  [AppFeature.ADD_EXPENSE_BUTTON]:   { requiredModule: ModuleName.EXPENSES,     blockedBehavior: BlockedBehavior.UPGRADE_POPUP },
  [AppFeature.EXPENSES_LIST_TAB]:       { requiredModule: ModuleName.EXPENSES,     blockedBehavior: BlockedBehavior.HIDE },
  [AppFeature.OPEN_BANKING_CONNECT]: { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.UPGRADE_POPUP },
  [AppFeature.DOCUMENTS_LIST_TAB]: { requiredModule: ModuleName.INVOICES, blockedBehavior: BlockedBehavior.HIDE },
  [AppFeature.ADD_OPEN_BANKING_BUTTON]: { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE },
  [AppFeature.OPEN_BANKING_TABLE]: { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE },
  [AppFeature.CATEGORY_LIST_TAB]: { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE },
  [AppFeature.OPEN_BANKING_PERMISSIONS_TAB]: { requiredModule: ModuleName.OPEN_BANKING, blockedBehavior: BlockedBehavior.HIDE },
};
