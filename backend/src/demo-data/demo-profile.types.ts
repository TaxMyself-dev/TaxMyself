import {
  BusinessType,
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
  /** EXEMPT → vatReportingType=NOT_REQUIRED. LICENSED/COMPANY → DUAL_MONTH_REPORT. */
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

export interface DemoTransactionTemplate {
  /** → DemoBill.key */
  billKey: string;
  /** → DemoBusiness.businessNumber */
  businessNumberRef: string;
  /** Hebrew or Latin merchant name (whatever fits the merchant). */
  merchantName: string;
  /** Negative for expenses, positive for income (matches existing convention). */
  amount: number;
  /** Subtracted from `today` at seed time to get transactionDate. */
  daysAgo: number;
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
  role?: UserRole[];
  hasOpenBanking?: boolean;
};

/** Re-exported so profile files can import enum values from one place. */
export { BusinessType, EmploymentType, FamilyStatus, Gender, ModuleName, SourceType, UserRole };
