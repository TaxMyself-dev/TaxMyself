/**
 * The single list of accounting-document terms used by the Gmail intake filter,
 * plus the one normalization/matching routine applied to every source it
 * searches: attachment filename, email subject, email body/snippet and — for
 * PDFs that none of those matched — the text extracted from the PDF itself.
 *
 * Scope rule for the list: a term must NAME an accounting document (or be an
 * unambiguous identifier of one). Generic finance words ("payment", "amount",
 * "total", "מסמך", "תשלום", "סכום") are deliberately absent — on their own they
 * would pull in newsletters, bank notices and marketing PDFs.
 */

/** Hebrew block — used for the Hebrew-aware word-boundary rules below. */
const HEBREW_RANGE = '\\u0590-\\u05FF';

/**
 * Hebrew one-letter clitics that legitimately glue onto a noun
 * (ו ה ב ל כ מ ש): "החשבונית", "בקבלה", "והחשבונית". Matching is allowed
 * through at most two of them, which still rejects unrelated words that merely
 * end with a keyword (e.g. the verb "התקבלה" contains "קבלה" but is preceded
 * by "ת", which is not a clitic).
 */
const HEBREW_PREFIX_LETTERS =
  '\\u05D5\\u05D4\\u05D1\\u05DC\\u05DB\\u05DE\\u05E9';

/**
 * Strong accounting-document terms. Singular/plural and Hebrew/English
 * spellings are listed explicitly rather than approximated by substring
 * matching, because loose matching is what produces false positives.
 * Punctuation and spacing variants ("חשבונית מס/קבלה", "tax-invoice",
 * "tax_invoice") do NOT need their own entry — normalization folds them onto
 * the space-separated form.
 */
export const ACCOUNTING_DOCUMENT_KEYWORDS: readonly string[] = [
  // --- Hebrew: invoices ---
  'חשבונית',
  'חשבוניות',
  'חשבונית מס',
  'חשבוניות מס',
  'חשבון מס',
  'חשבונית מס קבלה',
  'חשבוניות מס קבלה',
  'מס קבלה',
  'חשבונית עסקה',
  'חשבון עסקה',
  'חשבונית ריכוז',
  // --- Hebrew: receipts ---
  'קבלה',
  'קבלות',
  // --- Hebrew: credits ---
  'זיכוי',
  'זיכויים',
  'חשבונית זיכוי',
  'חשבונית מס זיכוי',
  'תעודת זיכוי',
  'הודעת זיכוי',
  // --- Hebrew: payment demand ---
  'דרישת תשלום',
  'דרישת חיוב',
  // --- English: invoices ---
  'invoice',
  'invoices',
  'tax invoice',
  'tax invoices',
  'vat invoice',
  'sales invoice',
  'purchase invoice',
  'proforma invoice',
  'pro forma invoice',
  'e invoice',
  // --- English: receipts ---
  'receipt',
  'receipts',
  'tax receipt',
  'invoice receipt',
  'tax invoice receipt',
  // --- English: credits / debits ---
  'credit note',
  'credit notes',
  'credit invoice',
  'credit memo',
  'debit note',
  // --- English: payment demand ---
  'payment request',
  // --- Transliterations senders actually use in filenames ---
  'kabala',
  'kabbala',
  'kabalah',
  'kabbalah',
  'kaballa',
  'cheshbonit',
  'heshbonit',
  'hashbonit',
  'hesbonit',
  'chashbonit',
  'chashbunit',
];

/**
 * Folds a piece of text onto the form the keywords are matched against:
 * lowercased, every non-letter/non-digit run (hyphens, slashes, underscores,
 * dots, Hebrew geresh/gershayim, quotes, line breaks, repeated spaces) turned
 * into a single space, then trimmed. So "חשבונית-מס", "חשבונית מס" and
 * "חשבונית  מס/קבלה" all reduce to the same spaced form.
 *
 * `compact` is the same string with every space removed. It exists only to
 * catch glued spellings ("taxinvoice.pdf", "חשבוניתמס") and is used for
 * multi-word keywords only — see matchesAccountingDocumentKeyword.
 */
export function normalizeForKeywordMatch(text: string | null | undefined): {
  spaced: string;
  compact: string;
} {
  const spaced = (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return { spaced, compact: spaced.replace(/ /g, '') };
}

/** Pre-compiled matcher for one keyword — built once at module load. */
interface KeywordMatcher {
  /** Boundary-aware pattern tested against the normalized `spaced` text. */
  spacedPattern: RegExp;
  /** Space-free form, tested as a plain substring; null for single-word keywords. */
  compact: string | null;
}

/**
 * Builds the boundary rules for one keyword.
 *
 * - A keyword starting/ending with a Latin letter or digit gets a plain
 *   word-boundary guard, so "invoice" never matches inside "invoiced" and a
 *   short term can never hide inside an unrelated English word.
 * - A Hebrew keyword allows up to two leading clitics (see
 *   HEBREW_PREFIX_LETTERS) but nothing else, and forbids a trailing Hebrew
 *   letter — Hebrew has no casing and glues its articles/prepositions on.
 */
function buildMatcher(keyword: string): KeywordMatcher | null {
  const { spaced, compact } = normalizeForKeywordMatch(keyword);
  if (!spaced) return null;

  const escaped = spaced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startsLatin = /^[a-z0-9]/.test(spaced);
  const endsLatin = /[a-z0-9]$/.test(spaced);

  const prefix = startsLatin
    ? '(?<![a-z0-9])'
    : `(?<=(?:^|[^${HEBREW_RANGE}])[${HEBREW_PREFIX_LETTERS}]{0,2})`;
  const suffix = endsLatin ? '(?![a-z0-9])' : `(?![${HEBREW_RANGE}])`;

  return {
    spacedPattern: new RegExp(`${prefix}${escaped}${suffix}`, 'u'),
    // Single-word keywords are already covered by the boundary-aware pattern;
    // giving them an unguarded substring form would reintroduce exactly the
    // false positives the boundaries exist to prevent.
    compact: compact === spaced ? null : compact,
  };
}

const KEYWORD_MATCHERS: KeywordMatcher[] = ACCOUNTING_DOCUMENT_KEYWORDS.map(
  buildMatcher,
).filter((matcher): matcher is KeywordMatcher => matcher !== null);

/**
 * True when `text` names an accounting document. Callers pass ONE source at a
 * time (filename, subject, body, PDF text) so a keyword can never be formed
 * accidentally across two different fields.
 */
export function matchesAccountingDocumentKeyword(
  text: string | null | undefined,
): boolean {
  const { spaced, compact } = normalizeForKeywordMatch(text);
  if (!spaced) return false;
  return KEYWORD_MATCHERS.some(
    (matcher) =>
      matcher.spacedPattern.test(spaced) ||
      (matcher.compact !== null && compact.includes(matcher.compact)),
  );
}
