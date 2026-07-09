import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserIntegration } from '../entities/user-integration.entity';
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationSyncStatus,
} from '../enums/integrations.enums';
import {
  describeGmailSyncError,
  getGmailSyncRetryable,
  getGmailSyncStage,
  SkippedAttachmentsAccumulator,
  tagGmailSyncError,
} from '../utils/gmail-sync-logging.util';
import { GmailDriveImportService, GmailImportResult } from './gmail-drive-import.service';
import { UserIntegrationsService } from './user-integrations.service';

/** All user-facing date boundaries are computed on Israel's calendar day. */
const ISRAEL_TIMEZONE = 'Asia/Jerusalem';

/**
 * A RUNNING sync older than this is considered dead (process restarted
 * mid-run) and may be restarted. Generous on purpose: an initial import over
 * a large mailbox legitimately runs for a long time.
 */
const STALE_RUNNING_SYNC_MS = 6 * 60 * 60 * 1000;

/**
 * Overlap subtracted from the cursor on nightly syncs. Gmail's after: matches
 * on receive time; indexing lag, clock skew and the UTC-midnight cursor of the
 * initial import all create boundary slop — re-scanning a few extra hours is
 * free because re-imports dedup on content hash.
 */
const NIGHTLY_SYNC_OVERLAP_MS = 3 * 60 * 60 * 1000;

/**
 * Identity of one sync run, threaded through its START/FINISH/FAILED logs so
 * production issues can be traced with a single grep (e.g. "int=12").
 */
interface GmailSyncRunContext {
  syncType: 'INITIAL' | 'NIGHTLY';
  integrationId: number;
  firebaseId: string;
  accountEmail: string | null;
  /** Human-readable sync window: date range (initial) or cursor→now (nightly). */
  window: string;
}

export interface GmailSyncStatusResponse {
  connected: boolean;
  accountEmail: string | null;
  initialImportCompleted: boolean;
  initialImportCompletedAt: string | null;
  /** Earliest selectable fromDate (YYYY-MM-DD) — Jan 1 of the previous year. */
  minFromDate: string;
  /** Latest selectable toDate (YYYY-MM-DD) — today. */
  maxToDate: string;
  lastSuccessfulSyncAt: string | null;
  lastSyncStatus: IntegrationSyncStatus | null;
  lastSyncError: string | null;
}

/**
 * Gmail sync orchestration: the user-facing sync status, the initial manual
 * import (date-range validation, RUNNING/completed conflict guards, async
 * execution, sync-state bookkeeping) and — in a later stage — the shared
 * window logic the nightly cron reuses.
 *
 * The actual mailbox work is delegated to GmailDriveImportService; document
 * analysis stays entirely in the existing Drive-inbox flow.
 */
@Injectable()
export class GmailSyncService {
  private readonly logger = new Logger(GmailSyncService.name);

  constructor(
    private readonly userIntegrationsService: UserIntegrationsService,
    private readonly gmailDriveImportService: GmailDriveImportService,
  ) {}

  // --- Date boundaries -------------------------------------------------------

  /** Today's calendar date in Israel as YYYY-MM-DD (en-CA formats exactly that). */
  private todayInIsrael(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TIMEZONE }).format(new Date());
  }

  /**
   * Earliest allowed fromDate: January 1st of the PREVIOUS calendar year,
   * computed at call time (2026 → 2025-01-01, 2027 → 2026-01-01).
   */
  getMinFromDate(): string {
    const currentYear = Number(this.todayInIsrael().slice(0, 4));
    return `${currentYear - 1}-01-01`;
  }

  /** Latest allowed toDate: today (a toDate in the future is meaningless). */
  getMaxToDate(): string {
    return this.todayInIsrael();
  }

  // --- Sync status (frontend polling target) ----------------------------------

  async getSyncStatus(firebaseId: string): Promise<GmailSyncStatusResponse> {
    const integration = await this.userIntegrationsService.findByUserAndProvider(
      firebaseId,
      IntegrationProvider.GOOGLE,
    );

    return {
      connected: integration?.status === IntegrationStatus.ACTIVE,
      accountEmail: integration?.accountEmail ?? null,
      initialImportCompleted: !!integration?.initialImportCompletedAt,
      initialImportCompletedAt: integration?.initialImportCompletedAt?.toISOString() ?? null,
      minFromDate: this.getMinFromDate(),
      maxToDate: this.getMaxToDate(),
      lastSuccessfulSyncAt: integration?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastSyncStatus: integration?.lastSyncStatus ?? null,
      lastSyncError: integration?.lastSyncError ?? null,
    };
  }

  // --- Initial manual import ---------------------------------------------------

  /**
   * Validates the requested range, guards against re-runs, marks the sync
   * RUNNING and kicks off the import in the background. Returns immediately —
   * the frontend polls getSyncStatus() until lastSyncStatus leaves RUNNING.
   */
  async startInitialImport(
    firebaseId: string,
    fromDate: string,
    toDate: string,
  ): Promise<{ started: true }> {
    const integration = await this.getConnectedIntegration(firebaseId);
    this.validateDateRange(fromDate, toDate);
    this.assertNoConflictingRun(integration);

    await this.userIntegrationsService.markSyncRunning(integration.id);

    const context: GmailSyncRunContext = {
      syncType: 'INITIAL',
      integrationId: integration.id,
      firebaseId,
      accountEmail: integration.accountEmail,
      window: `${fromDate}..${toDate}`,
    };

    // Deliberately not awaited: a range import can take many minutes and must
    // not block (or time out) the HTTP request. runInitialImport never throws.
    void this.runInitialImport(context, fromDate, toDate);

    return { started: true };
  }

  private async getConnectedIntegration(firebaseId: string): Promise<UserIntegration> {
    const integration = await this.userIntegrationsService.findByUserAndProvider(
      firebaseId,
      IntegrationProvider.GOOGLE,
    );
    if (!integration) {
      throw new NotFoundException(
        'No Google integration found for this user. Connect a Google account first.',
      );
    }
    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new BadRequestException(
        `Google integration is ${integration.status} — reconnect the Google account.`,
      );
    }
    return integration;
  }

  private validateDateRange(fromDate: string, toDate: string): void {
    if (!this.isValidCalendarDate(fromDate)) {
      throw new BadRequestException(`fromDate "${fromDate}" is not a valid calendar date`);
    }
    if (!this.isValidCalendarDate(toDate)) {
      throw new BadRequestException(`toDate "${toDate}" is not a valid calendar date`);
    }

    // All three values are YYYY-MM-DD, so plain string comparison is correct
    // and sidesteps timezone parsing entirely.
    const minFromDate = this.getMinFromDate();
    const maxToDate = this.getMaxToDate();
    if (fromDate < minFromDate) {
      throw new BadRequestException(
        `fromDate cannot be earlier than ${minFromDate} (January 1st of the previous year)`,
      );
    }
    if (toDate > maxToDate) {
      throw new BadRequestException(`toDate cannot be in the future (today is ${maxToDate})`);
    }
    if (fromDate > toDate) {
      throw new BadRequestException('fromDate must be on or before toDate');
    }
  }

  /** Rejects a second initial import and overlapping runs (409 for both). */
  private assertNoConflictingRun(integration: UserIntegration): void {
    if (integration.initialImportCompletedAt) {
      throw new ConflictException(
        'The initial Gmail import has already been completed for this account.',
      );
    }
    if (this.hasLiveRunningSync(integration)) {
      throw new ConflictException('A Gmail sync is already running for this account.');
    }
  }

  /**
   * True when a RUNNING marker belongs to a sync that is plausibly still
   * alive. A marker older than STALE_RUNNING_SYNC_MS is treated as dead
   * (process restarted mid-run) and logged — callers may start a new run.
   */
  private hasLiveRunningSync(integration: UserIntegration): boolean {
    if (integration.lastSyncStatus !== IntegrationSyncStatus.RUNNING) return false;

    const startedAt = integration.lastSyncStartedAt?.getTime() ?? 0;
    if (Date.now() - startedAt <= STALE_RUNNING_SYNC_MS) return true;

    this.logger.warn(
      `Integration ${integration.id} stuck in RUNNING since ` +
        `${integration.lastSyncStartedAt?.toISOString()} — treating as dead`,
    );
    return false;
  }

  /**
   * The background half of the initial import. Never throws: every outcome is
   * recorded on the integration row, which is the only progress channel the
   * polling frontend sees.
   */
  private async runInitialImport(
    context: GmailSyncRunContext,
    fromDate: string,
    toDate: string,
  ): Promise<void> {
    const runStartedAt = new Date();
    const skipStats = new SkippedAttachmentsAccumulator();
    this.logRunStart(context);
    try {
      const result = await this.gmailDriveImportService.importFromGmail(context.firebaseId, {
        query: this.buildDateRangeQuery(fromDate, toDate),
        // No maxMessages: the reader pages through the entire range.
        includeFileDetails: false,
        skipStats,
      });

      // Cursor for the nightly sync. End of the imported range is the day
      // AFTER toDate at midnight; but when toDate is today, mail keeps
      // arriving after the scan — so never place the cursor past the moment
      // this run started. (Boundary slop is absorbed by content-hash dedup.)
      const rangeEnd = new Date(`${this.dayAfter(toDate)}T00:00:00Z`);
      const lastSuccessfulSyncAt = runStartedAt < rangeEnd ? runStartedAt : rangeEnd;

      try {
        await this.userIntegrationsService.markSyncSuccess(context.integrationId, {
          lastSuccessfulSyncAt,
          initialImport: { fromDate, toDate },
        });
      } catch (error) {
        throw tagGmailSyncError(error, 'SAVE_SYNC_STATE');
      }
      this.logRunFinish(context, result, Date.now() - runStartedAt.getTime());
      this.logSkippedSummary(context, skipStats);
    } catch (error: any) {
      // Cursor and initialImportCompletedAt untouched — the user can retry.
      this.logRunFailure(context, error);
      await this.persistRunError(context, error);
    }
  }

  // --- Nightly incremental sync -------------------------------------------------

  /**
   * One user's incremental sync: pull mail received since the cursor
   * (lastSuccessfulSyncAt, minus a dedup-absorbed overlap) until now, through
   * the same import pipeline as the initial import. Called by the nightly
   * cron for each eligible integration.
   *
   * Never throws — the outcome is returned for the cron's summary and
   * persisted on the integration row. The cursor advances to the moment the
   * run STARTED (mail arriving mid-run is caught next night), and only on
   * success.
   */
  async runIncrementalSync(
    integration: UserIntegration,
  ): Promise<{ outcome: 'success' | 'skipped' | 'error'; detail: string }> {
    if (this.hasLiveRunningSync(integration)) {
      return { outcome: 'skipped', detail: 'a sync is already running' };
    }
    if (!integration.lastSuccessfulSyncAt) {
      // Initial import completed but no cursor — should be impossible; do not
      // guess a window, a human should look at this row.
      this.logger.error(
        `Integration ${integration.id} has initialImportCompletedAt but no ` +
          'lastSuccessfulSyncAt — skipping nightly sync',
      );
      return { outcome: 'skipped', detail: 'no sync cursor' };
    }

    const windowEnd = new Date();
    const context: GmailSyncRunContext = {
      syncType: 'NIGHTLY',
      integrationId: integration.id,
      firebaseId: integration.firebaseId,
      accountEmail: integration.accountEmail,
      window: `${integration.lastSuccessfulSyncAt.toISOString()}..${windowEnd.toISOString()}`,
    };

    const skipStats = new SkippedAttachmentsAccumulator();
    await this.userIntegrationsService.markSyncRunning(integration.id);
    this.logRunStart(context);
    try {
      // Epoch seconds, not a YYYY/MM/DD date: after: with a date is
      // day-granular and timezone-fuzzy; the epoch form is exact.
      const afterEpochSeconds = Math.floor(
        (integration.lastSuccessfulSyncAt.getTime() - NIGHTLY_SYNC_OVERLAP_MS) / 1000,
      );
      const result = await this.gmailDriveImportService.importFromGmail(
        integration.firebaseId,
        {
          query: `has:attachment after:${afterEpochSeconds}`,
          includeFileDetails: false,
          skipStats,
        },
      );

      try {
        await this.userIntegrationsService.markSyncSuccess(integration.id, {
          lastSuccessfulSyncAt: windowEnd,
        });
      } catch (error) {
        throw tagGmailSyncError(error, 'SAVE_SYNC_STATE');
      }
      this.logRunFinish(context, result, Date.now() - windowEnd.getTime());
      this.logSkippedSummary(context, skipStats);
      return {
        outcome: 'success',
        detail: `${result.imported} imported of ${result.attachmentsFound} candidates`,
      };
    } catch (error: any) {
      this.logRunFailure(context, error);
      await this.persistRunError(context, error);
      return { outcome: 'error', detail: error?.message ?? String(error) };
    }
  }

  // --- Run logging (see gmail-sync-logging.util.ts for the stage vocabulary) ----

  private runPrefix(context: GmailSyncRunContext): string {
    return (
      `[gmail-sync ${context.syncType} int=${context.integrationId} ` +
      `user=${context.firebaseId} account=${context.accountEmail ?? 'unknown'}]`
    );
  }

  private logRunStart(context: GmailSyncRunContext): void {
    this.logger.log(`${this.runPrefix(context)} START window=${context.window}`);
  }

  /**
   * The single success summary of a run. WARN (not error) when some messages
   * failed but the run completed — the cursor advanced, dedup makes a manual
   * re-run safe, and the failed ids are listed for follow-up.
   */
  private logRunFinish(
    context: GmailSyncRunContext,
    result: GmailImportResult,
    durationMs: number,
  ): void {
    const line =
      `${this.runPrefix(context)} FINISH window=${context.window} durationMs=${durationMs} ` +
      `messages=${result.messagesFound} messagesFailed=${result.messagesFailed} ` +
      `attachments=${result.attachmentsFound} imported=${result.imported} ` +
      `alreadyImported=${result.alreadyImported} skipped=${result.skipped}` +
      (result.failedMessageIds.length > 0
        ? ` failedMessageIds=${result.failedMessageIds.join(',')}`
        : '');
    if (result.messagesFailed > 0) this.logger.warn(line);
    else this.logger.log(line);
  }

  /**
   * One aggregated DEBUG summary of EXPECTED attachment skips, emitted right
   * after FINISH and only when at least one attachment was skipped. Replaces
   * the old per-attachment DEBUG lines that flooded logs on large imports;
   * actual failures are still logged individually elsewhere.
   */
  private logSkippedSummary(
    context: GmailSyncRunContext,
    skipStats: SkippedAttachmentsAccumulator,
  ): void {
    if (!skipStats.hasSkips()) return;
    this.logger.debug(`${this.runPrefix(context)}\n\n${skipStats.format()}`);
  }

  private logRunFailure(context: GmailSyncRunContext, error: any): void {
    const retryable = getGmailSyncRetryable(error);
    this.logger.error(
      `${this.runPrefix(context)} FAILED stage=${getGmailSyncStage(error)} ` +
        `retryable=${retryable ?? 'unknown'} window=${context.window} ` +
        `error=${error?.message ?? error}`,
      error?.stack,
    );
  }

  /** Persists "STAGE: message" into lastSyncError; a persist failure only logs. */
  private async persistRunError(context: GmailSyncRunContext, error: any): Promise<void> {
    await this.userIntegrationsService
      .markSyncError(context.integrationId, describeGmailSyncError(error))
      .catch((persistError) =>
        this.logger.error(
          `${this.runPrefix(context)} stage=SAVE_SYNC_STATE could not persist ` +
            `sync error: ${persistError}`,
        ),
      );
  }

  /**
   * Gmail search for the chosen range. Gmail's `before:` is EXCLUSIVE, so the
   * day after toDate makes toDate itself inclusive. Gmail expects YYYY/MM/DD.
   */
  private buildDateRangeQuery(fromDate: string, toDate: string): string {
    const after = fromDate.replace(/-/g, '/');
    const before = this.dayAfter(toDate).replace(/-/g, '/');
    return `has:attachment after:${after} before:${before}`;
  }

  /** YYYY-MM-DD → the following day, also YYYY-MM-DD (UTC math, no DST traps). */
  private dayAfter(isoDate: string): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  /** True when the YYYY-MM-DD string is a real calendar date (no 2026-02-30). */
  private isValidCalendarDate(isoDate: string): boolean {
    const date = new Date(`${isoDate}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoDate;
  }
}
