import { DocumentImportDestination } from 'src/document-import/document-import.service';

/**
 * Which user action produced this summary. The nightly cron does not build
 * one — nobody is waiting for it — but it runs through the same importAccount()
 * path, so the model would fit it unchanged if that ever changes.
 */
export type GmailImportRunType = 'INITIAL' | 'MANUAL';

/**
 * Why one mailbox failed, in terms the UI can translate. Deliberately coarse:
 * the exact exception is logged and persisted server-side for support, never
 * shipped to the browser.
 */
export type GmailImportErrorCode = 'ACCOUNT_NEEDS_RECONNECT' | 'IMPORT_FAILED';

/** One mailbox's outcome. Counts are disjoint — every attachment lands in exactly one. */
export interface GmailImportAccountSummary {
  integrationId: number;
  accountEmail: string | null;
  /** New documents stored under the destination business. */
  imported: number;
  /** Bytes already in the system for this business — a duplicate, not a failure. */
  alreadyImported: number;
  /** Dropped on purpose by the reader (logos, inline assets, non-invoice files). */
  skippedIrrelevant: number;
  /** Real problems: per-file upload/ledger failures + messages that could not be read. */
  failed: number;
  /** Null when this mailbox completed; a code (never a raw message) when it did not. */
  errorCode: GmailImportErrorCode | null;
}

/**
 * The single user-facing result model for a Gmail import run — the manual
 * "pull now" response body AND the persisted outcome of the background initial
 * import. One model, one frontend renderer.
 */
export interface GmailImportSummary {
  runType: GmailImportRunType;
  /** ISO timestamp of when the run finished. */
  finishedAt: string;
  totalImported: number;
  totalAlreadyImported: number;
  totalSkippedIrrelevant: number;
  totalFailed: number;
  /**
   * The businesses documents were actually stored under, taken from the real
   * per-file import results. Normally exactly one; empty when the run handled
   * no attachment at all (nothing was stored, so there is nothing to claim).
   * A list rather than a single value so a future multi-business routing rule
   * is reported honestly instead of being collapsed into a guess.
   */
  destinations: DocumentImportDestination[];
  perAccount: GmailImportAccountSummary[];
}

/** Rolls per-mailbox outcomes into the run-level summary both flows return. */
export function buildGmailImportSummary(
  runType: GmailImportRunType,
  accounts: GmailImportAccountSummary[],
  destinations: DocumentImportDestination[],
): GmailImportSummary {
  return {
    runType,
    finishedAt: new Date().toISOString(),
    totalImported: sum(accounts, (a) => a.imported),
    totalAlreadyImported: sum(accounts, (a) => a.alreadyImported),
    totalSkippedIrrelevant: sum(accounts, (a) => a.skippedIrrelevant),
    totalFailed: sum(accounts, (a) => a.failed),
    destinations: dedupeDestinations(destinations),
    perAccount: accounts,
  };
}

/** Distinct destinations, first-seen order — a run normally yields exactly one. */
export function dedupeDestinations(
  destinations: DocumentImportDestination[],
): DocumentImportDestination[] {
  const byNumber = new Map<string, DocumentImportDestination>();
  for (const destination of destinations) {
    if (!byNumber.has(destination.businessNumber)) {
      byNumber.set(destination.businessNumber, destination);
    }
  }
  return [...byNumber.values()];
}

function sum(
  accounts: GmailImportAccountSummary[],
  pick: (account: GmailImportAccountSummary) => number,
): number {
  return accounts.reduce((total, account) => total + pick(account), 0);
}
