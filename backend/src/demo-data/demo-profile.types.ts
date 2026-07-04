import {
  BusinessType,
  DocumentType,
  EmploymentType,
  FamilyStatus,
  Gender,
  ModuleName,
  SourceType,
  UserRole,
} from 'src/enum';

/**
 * Static profile description used by the demo-data seeder.
 * Profiles live as TS files in `profiles/` so they're version-controlled,
 * type-checked, and trivially diff-able.
 */
export interface DemoProfile {
  /** Stable ID, used in URLs and as a logical key (e.g. 'couple-two-businesses'). */
  id: string;
  /** Hebrew label shown on the admin card. */
  label: string;
  /** Short Hebrew description shown on the admin card. */
  description: string;

  /** Sign-in credentials. The admin sees these on Set so they can log in. */
  email: string;
  password: string;

  /** Primary user (the one who signs in with `email`/`password`). */
  user: DemoUser;

  /** Spouse data — flat fields, mapped onto User.spouse* columns. Optional. */
  spouse?: DemoSpouse;

  /** One Business row per entry. All linked to the primary user's firebaseId. */
  businesses: DemoBusiness[];

  /** Bills + Sources are required parents for any transaction. */
  bills: DemoBill[];

  /** Mock transactions land in FullTransactionCache. */
  transactions: DemoTransactionTemplate[];

  /**
   * Real Documents to seed via DocumentsService.createDoc() AFTER the main
   * seed transaction commits. Each income document posts a journal entry
   * (debit A/R 1000, credit revenue 4000 + output VAT 2400; credit notes
   * reverse). Requires the chart-of-accounts rows to exist — see
   * account.seed.ts. Optional.
   */
  documents?: DemoDocumentTemplate[];

  /**
   * Real Expenses to seed via ExpensesService.addExpense() AFTER the main
   * seed transaction commits. Each posts a journal entry (debit expense 5000
   * + deductible VAT input 2410, credit 1000). Optional.
   */
  expenses?: DemoExpenseTemplate[];

  /**
   * Orphan Source rows seeded with no parent Bill — needed when transactions
   * carry a `paymentIdentifier` but no `billKey`, so the user can later
   * associate them via POST /transactions/:billId/sources (which refuses to
   * invent sources). Mirrors the real OB post-sync state.
   */
  standaloneSources?: DemoStandaloneSource[];

  /**
   * Role override for the primary user. Default is `[REGULAR]`.
   * Use `[ACCOUNTANT]` (optionally + `REGULAR`) for accountant profiles —
   * the "משרד" tab on the frontend is gated by the `ACCOUNTANT` role.
   */
  role?: UserRole[];

  /**
   * Whether the demo user is "connected to Open Banking". When true the
   * dashboard shows the transactions table; when false it shows the
   * connect-bank CTA. Defaults to `true` — set to `false` for accountant
   * profiles where the primary user has no personal bank connection.
   */
  hasOpenBanking?: boolean;

  /**
   * Optional sub-users delegated to the primary user (intended for accountant
   * profiles). Each gets their own Firebase auth user, User row, businesses,
   * bills, sources, transactions, and a Delegation row pointing to the
   * primary user as the agent.
   */
  delegatedClients?: DemoClient[];

  /**
   * When set, the seeder also provisions the primary user's Drive folders
   * (user root + business folder + inbox/processed) and uploads
   * every file from `sourceDir` into the first business's inbox/. Same
   * directory is re-uploaded by the `/demo-data/test-reset` endpoint after
   * the inbox is wiped, so the demo user can re-run OCR end-to-end from
   * a known starting state without admin intervention.
   *
   * `sourceDir` is resolved relative to the backend process CWD (`cwd` is
   * typically the repo root in dev and the dist/ dir in prod — the seeder
   * tries both).
   */
  seedDriveFiles?: { sourceDir: string };
}

/**
 * A client of an accountant — same shape as the primary profile slice
 * (sans id/label/description) plus their own credentials.
 */
export interface DemoClient {
  /** Sign-in credentials for this client (admin can impersonate them). */
  email: string;
  password: string;
  user: DemoUser;
  spouse?: DemoSpouse;
  businesses: DemoBusiness[];
  bills: DemoBill[];
  transactions: DemoTransactionTemplate[];
  standaloneSources?: DemoStandaloneSource[];
}

export interface DemoUser {
  fName: string;
  lName: string;
  /** Israeli ID; matches Business.businessNumber for one of the businesses. */
  id: string;
  phone: string;
  gender: Gender;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  city: string;
  employmentStatus: EmploymentType;
  /** MARRIED for the couple profile, SINGLE/DIVORCED for others. */
  familyStatus: FamilyStatus;
}

export interface DemoSpouse {
  fName: string;
  lName: string;
  /** Israeli ID; matches Business.businessNumber for the spouse-owned business. */
  id: string;
  phone: string;
  email: string;
  gender: Gender;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  employmentStatus: EmploymentType;
}

export interface DemoBusiness {
  businessName: string;
  /** Either the primary user's `id` or the spouse's `id`. */
  businessNumber: string;
  /** EXEMPT → vatReportingType=NOT_REQUIRED. LICENSED → DUAL_MONTH_REPORT. */
  businessType: BusinessType;
  businessField?: string;
  businessAddress?: string;
  advanceTaxPercent?: number;
}

export interface DemoBill {
  /** Local key (e.g. 'main-checking') referenced by transactions. */
  key: string;
  billName: string;
  /** Points at one of the businesses' businessNumber. */
  businessNumberRef: string;
  sources: Array<{ sourceName: string; sourceType: SourceType }>;
}

/**
 * A Source row created without a parent Bill — mirrors the state after a
 * real Open-Banking sync but before the user has created bills. Required so
 * the demo's "associate to bill" flow can find a matching Source row by
 * `(userId, sourceName)` — the attach endpoint refuses to invent sources.
 */
export interface DemoStandaloneSource {
  /** Payment identifier (bank account digits / card last-4). Must match what
   *  the corresponding DemoTransactionTemplate carries on `paymentIdentifier`. */
  sourceName: string;
  sourceType: SourceType;
}

export interface DemoTransactionTemplate {
  /**
   * Optional. When present, must match a DemoBill.key — transaction is
   * seeded onto that bill (billId + billName + paymentIdentifier inherited
   * from the bill). When omitted, the transaction is "unassigned": billId
   * and billName are stored as null and the row shows up in the UI under
   * the "לא שוייך" state, ready for the user to associate to a bill.
   */
  billKey?: string;
  /**
   * Payment identifier (bank account number / card last digits) stamped on
   * the cache row — mirrors what Feezback would return in production.
   *
   * When `billKey` is also set, this identifier WINS over the bill's first
   * source. That lets a single bill back multiple sources (one bill with a
   * BANK + a CARD source, each transaction tagged with the matching
   * identifier — the typical real-world layout). Only when this field is
   * omitted does the seeder fall back to the bill's first source.
   *
   * When `billKey` is omitted entirely, the transaction is "unassigned"
   * (billId/billName null) and shows up in the UI under "לא שוייך" — the
   * shape you want when demoing the bill-creation flow.
   */
  paymentIdentifier?: string;
  /** → DemoBusiness.businessNumber */
  businessNumberRef: string;
  /** Hebrew or Latin merchant name (whatever fits the merchant). */
  merchantName: string;
  /** Negative for expenses, positive for income (matches existing convention). */
  amount: number;
  /** Subtracted from `today` at seed time to get transactionDate. */
  daysAgo: number;
  /**
   * ISO-4217 currency code. Defaults to 'ILS'. For non-ILS values the seed
   * also stamps `ilsAmount` + `fxRateToIls` using hardcoded demo rates so the
   * תזרים column renderer can show "$X (₪Y)" without needing a BOI fetch.
   */
  currency?: 'ILS' | 'USD' | 'EUR' | 'GBP';
}

/**
 * A real income/sales document seeded through DocumentsService.createDoc().
 * Only the document types that post journal entries are useful here
 * (TAX_INVOICE, TAX_INVOICE_RECEIPT, RECEIPT, CREDIT_INVOICE).
 */
export interface DemoDocumentTemplate {
  /** Which business this belongs to (→ DemoBusiness.businessNumber). */
  businessNumberRef: string;
  docType: DocumentType;
  recipientName: string;
  recipientId?: string;
  /** Net amount before VAT (after any discount). */
  sumAftDisBefVAT: number;
  /** VAT amount (0 for exempt / RECEIPT). */
  vatSum: number;
  /** YYYY-MM-DD */
  docDate: string;
}

/** A real expense seeded through ExpensesService.addExpense(). */
export interface DemoExpenseTemplate {
  /** Which business this belongs to (→ DemoBusiness.businessNumber). */
  businessNumberRef: string;
  merchantName: string;
  /** Total including VAT. */
  sum: number;
  /** VAT recognition percent passed to addExpense (0 = no deductible VAT). */
  vatPercent: number;
  /** Tax (income-tax) deductibility percent (0–100). Defaults to 100. */
  taxPercent?: number;
  /** YYYY-MM-DD */
  expenseDate: string;
  /** Optional bookkeeping category id (informational; addExpense uses names). */
  categoryId?: number;
  /** Bookkeeping category name — drives the sub-category accountCode lookup in
   *  addExpense. Falls back to a generic placeholder when omitted. */
  category?: string;
  /** Bookkeeping sub-category name (matched with `category` against
   *  default_sub_category to resolve the journal accountCode). */
  subCategory?: string;
  /** When true the expense is routed to the equipment/depreciation account (6300)
   *  instead of the regular expense accounts. Defaults to false. */
  isEquipment?: boolean;
}

/** Subset of fields shared by DemoProfile and DemoClient — used by the seed helper. */
export type DemoSeedable = {
  email: string;
  password: string;
  user: DemoUser;
  spouse?: DemoSpouse;
  businesses: DemoBusiness[];
  bills: DemoBill[];
  transactions: DemoTransactionTemplate[];
  /** Orphan sources (no parent bill) — see DemoStandaloneSource. */
  standaloneSources?: DemoStandaloneSource[];
  role?: UserRole[];
  hasOpenBanking?: boolean;
};

/** Re-exported so profile files can import enum values from one place. */
export { BusinessType, DocumentType, EmploymentType, FamilyStatus, Gender, ModuleName, SourceType, UserRole };
