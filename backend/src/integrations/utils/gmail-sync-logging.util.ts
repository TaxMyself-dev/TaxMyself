/**
 * Shared logging vocabulary for the Gmail sync flow. Every run-aborting error
 * is tagged with the STAGE it occurred in and (when determinable) whether a
 * retry could succeed, so a single production log line answers "where did it
 * break and will tonight's run self-heal".
 *
 * Tags ride on the error object itself (gmailSyncStage/gmailSyncRetryable),
 * so they survive rethrows across service boundaries without changing any
 * function signature; the innermost (most specific) tag wins.
 */
export type GmailSyncStage =
  | 'LOAD_INTEGRATION'
  | 'TOKEN_REFRESH'
  | 'SEARCH_MESSAGES'
  | 'LOAD_MESSAGE'
  | 'DOWNLOAD_ATTACHMENT'
  | 'HASH_DEDUP'
  | 'UPLOAD_TO_DRIVE'
  | 'START_DOCUMENT_IMPORT'
  | 'SAVE_SYNC_STATE'
  | 'FINISH';

interface TaggedError {
  gmailSyncStage?: GmailSyncStage;
  gmailSyncRetryable?: boolean;
}

/**
 * Tags an error with its sync stage (and optionally retryability) and returns
 * it. Existing tags are never overwritten — the throw site closest to the
 * failure knows best.
 */
export function tagGmailSyncError<T>(error: T, stage: GmailSyncStage, retryable?: boolean): T {
  const target = error as TaggedError | null;
  if (target && typeof target === 'object') {
    if (!target.gmailSyncStage) target.gmailSyncStage = stage;
    if (retryable !== undefined && target.gmailSyncRetryable === undefined) {
      target.gmailSyncRetryable = retryable;
    }
  }
  return error;
}

export function getGmailSyncStage(error: unknown): GmailSyncStage | 'UNKNOWN' {
  return (error as TaggedError)?.gmailSyncStage ?? 'UNKNOWN';
}

/** undefined = could not be classified. */
export function getGmailSyncRetryable(error: unknown): boolean | undefined {
  return (error as TaggedError)?.gmailSyncRetryable;
}

/** Compact "STAGE: message" string — what gets persisted into lastSyncError. */
export function describeGmailSyncError(error: any): string {
  const message = error?.message ?? String(error);
  return `${getGmailSyncStage(error)}: ${message}`;
}

// --- Skipped-attachment aggregation ------------------------------------------

/** Unique example filenames kept per skip reason — enough to troubleshoot, bounded. */
const MAX_SKIP_EXAMPLES = 5;

/**
 * Canonical, stable labels for EXPECTED attachment skips (not failures).
 * The reader classifies every skip into exactly one of these so the summary
 * groups cleanly regardless of the per-file detail (byte counts, extension).
 */
export const GmailSkipReason = {
  MISSING_FILENAME: 'missing filename',
  UNSUPPORTED_EXTENSION: 'unsupported extension',
  ASSET_FILENAME: 'asset-like filename',
  INLINE_ASSET: 'inline email asset',
  IMAGE_TOO_SMALL: 'image too small',
  PDF_TOO_SMALL: 'pdf too small',
  PDF_INVALID: 'invalid pdf content',
  NOT_INVOICE_OR_RECEIPT: 'filename/email text not invoice or receipt',
} as const;

export type GmailSkipReason = (typeof GmailSkipReason)[keyof typeof GmailSkipReason];

/**
 * Lightweight, bounded aggregator for EXPECTED skipped attachments during a
 * Gmail run. A large import legitimately skips thousands of attachments
 * (inline assets, logos, tiny images); logging each one floods production for
 * no reason. Instead the run records every skip here and emits ONE summary at
 * FINISH.
 *
 * Memory stays flat regardless of mailbox size: per reason we keep only a
 * running count and up to MAX_SKIP_EXAMPLES unique example filenames — never
 * the full list of skipped names.
 */
export class SkippedAttachmentsAccumulator {
  private readonly reasons = new Map<string, { count: number; examples: Set<string> }>();
  private total = 0;

  /** Records one skipped attachment; `filename` feeds the bounded examples. */
  record(reason: string, filename?: string | null): void {
    this.total += 1;
    let entry = this.reasons.get(reason);
    if (!entry) {
      entry = { count: 0, examples: new Set<string>() };
      this.reasons.set(reason, entry);
    }
    entry.count += 1;
    const name = filename?.trim();
    if (name && entry.examples.size < MAX_SKIP_EXAMPLES) {
      entry.examples.add(name);
    }
  }

  get totalSkipped(): number {
    return this.total;
  }

  hasSkips(): boolean {
    return this.total > 0;
  }

  /**
   * Renders the multi-line SKIPPED SUMMARY body (reasons sorted by count, with
   * a few example filenames each). The caller prefixes it with the run prefix
   * and decides the log level. Returns '' when nothing was skipped.
   */
  format(): string {
    if (this.total === 0) return '';

    const sorted = [...this.reasons.entries()].sort((a, b) => b[1].count - a[1].count);
    const labelWidth = Math.max(...sorted.map(([reason]) => reason.length));

    const lines: string[] = ['SKIPPED SUMMARY', '', `Total skipped attachments: ${this.total}`, '', 'Reasons:'];
    for (const [reason, { count }] of sorted) {
      const dots = '.'.repeat(Math.max(3, labelWidth - reason.length + 3));
      lines.push(`- ${reason} ${dots} ${count}`);
    }

    const withExamples = sorted.filter(([, { examples }]) => examples.size > 0);
    if (withExamples.length > 0) {
      lines.push('', 'Examples:');
      for (const [reason, { examples }] of withExamples) {
        lines.push(`- ${reason}: ${[...examples].join(', ')}`);
      }
    }

    return lines.join('\n');
  }
}
