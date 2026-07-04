import { DefaultBookingAccount } from './account.entity';

// Canonical chart of accounts for the bookkeeping/journal feature.
//
// This is the SOURCE OF TRUTH for these account codes. AccountSeedService
// upserts this list into `default_booking_account` on every app bootstrap
// (INSERT ... ON DUPLICATE KEY UPDATE, keyed on the unique `code`), so dev,
// staging, and production all converge here automatically — no manual SQL.
//
// NOTE: because the upsert overwrites `name`/`type`/`pnlCategory`/`displayOrder`
// for these codes on every boot, manual DB edits to these rows are reverted on
// restart. Edit them here instead.
export const DEFAULT_ACCOUNTS: Pick<
  DefaultBookingAccount,
  'code' | 'name' | 'type' | 'pnlCategory' | 'displayOrder'
>[] = [
  // Technical / transfer
  { code: '1000', name: 'חשבון מעבר',              type: 'asset',     pnlCategory: null, displayOrder: null },
  { code: '1100', name: 'בנק',                      type: 'asset',     pnlCategory: null, displayOrder: null },
  { code: '1110', name: 'מזומן',                    type: 'asset',     pnlCategory: null, displayOrder: null },
  { code: '1120', name: 'כרטיס אשראי / סליקה',     type: 'asset',     pnlCategory: null, displayOrder: null },
  { code: '1200', name: 'לקוחות כלליים',            type: 'asset',     pnlCategory: null, displayOrder: null },

  // Liabilities
  { code: '2000', name: 'ספקים כלליים',             type: 'liability', pnlCategory: null, displayOrder: null },
  { code: '2100', name: 'כרטיסי אשראי לתשלום',     type: 'liability', pnlCategory: null, displayOrder: null },
  { code: '2400', name: 'מע"מ עסקאות',              type: 'liability', pnlCategory: null, displayOrder: null },
  { code: '2410', name: 'מע"מ תשומות',              type: 'asset',     pnlCategory: null, displayOrder: null },

  // Income
  { code: '4000', name: 'הכנסות',                   type: 'income',    pnlCategory: 'הכנסות',                  displayOrder: 1  },
  { code: '4010', name: 'הכנסות פטורות',            type: 'income',    pnlCategory: 'הכנסות פטורות',           displayOrder: 2  },

  // Expenses
  { code: '5000', name: 'הוצאות בלתי מזוהות',      type: 'expense',   pnlCategory: 'הוצאות בלתי מזוהות',     displayOrder: 14 },
  { code: '5100', name: 'הוצאות משרד',              type: 'expense',   pnlCategory: 'הוצאות משרד',             displayOrder: 3  },
  { code: '5200', name: 'רכב ותחבורה',              type: 'expense',   pnlCategory: 'רכב ותחבורה',             displayOrder: 4  },
  { code: '5300', name: 'תקשורת',                   type: 'expense',   pnlCategory: 'תקשורת',                  displayOrder: 5  },
  { code: '5400', name: 'תוכנות ושירותי ענן',       type: 'expense',   pnlCategory: 'תוכנות ושירותי ענן',      displayOrder: 6  },
  { code: '5500', name: 'שיווק ופרסום',             type: 'expense',   pnlCategory: 'שיווק ופרסום',            displayOrder: 7  },
  { code: '5600', name: 'ייעוץ ושירותים מקצועיים', type: 'expense',   pnlCategory: 'ייעוץ ושירותים מקצועיים', displayOrder: 8  },
  { code: '5700', name: 'הנהלת חשבונות',            type: 'expense',   pnlCategory: 'הנהלת חשבונות',           displayOrder: 9  },
  { code: '5800', name: 'שכר',                      type: 'expense',   pnlCategory: 'שכר',                     displayOrder: 10 },
  { code: '5900', name: 'ספרות מקצועית',            type: 'expense',   pnlCategory: 'ספרות מקצועית',           displayOrder: 11 },
  { code: '6000', name: 'כיבוד',                    type: 'expense',   pnlCategory: 'כיבוד',                   displayOrder: 12 },
  { code: '6100', name: 'עמלות ודמי כרטיס',        type: 'expense',   pnlCategory: 'עמלות ודמי כרטיס',        displayOrder: 13 },
  { code: '6200', name: 'הוצאות מימון',             type: 'expense',   pnlCategory: 'הוצאות מימון',            displayOrder: 15 },
  { code: '6300', name: 'פחת',                      type: 'expense',   pnlCategory: 'פחת',                     displayOrder: 16 },
];
