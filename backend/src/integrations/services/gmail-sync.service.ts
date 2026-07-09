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
import { GmailDriveImportService } from './gmail-drive-import.service';
import { UserIntegrationsService } from './user-integrations.service';

/** All user-facing date boundaries are computed on Israel's calendar day. */
const ISRAEL_TIMEZONE = 'Asia/Jerusalem';

/**
 * A RUNNING sync older than this is considered dead (process restarted
 * mid-run) and may be restarted. Generous on purpose: an initial import over
 * a large mailbox legitimately runs for a long time.
 */
const STALE_RUNNING_SYNC_MS = 6 * 60 * 60 * 1000;

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
    this.logger.log(
      `Initial Gmail import started for firebaseId=${firebaseId} ` +
        `(integration ${integration.id}) range ${fromDate}..${toDate}`,
    );

    // Deliberately not awaited: a range import can take many minutes and must
    // not block (or time out) the HTTP request. runInitialImport never throws.
    void this.runInitialImport(integration.id, firebaseId, fromDate, toDate);

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
    if (integration.lastSyncStatus === IntegrationSyncStatus.RUNNING) {
      const startedAt = integration.lastSyncStartedAt?.getTime() ?? 0;
      const isStale = Date.now() - startedAt > STALE_RUNNING_SYNC_MS;
      if (!isStale) {
        throw new ConflictException('A Gmail sync is already running for this account.');
      }
      this.logger.warn(
        `Integration ${integration.id} stuck in RUNNING since ` +
          `${integration.lastSyncStartedAt?.toISOString()} — treating as dead and restarting`,
      );
    }
  }

  /**
   * The background half of the initial import. Never throws: every outcome is
   * recorded on the integration row, which is the only progress channel the
   * polling frontend sees.
   */
  private async runInitialImport(
    integrationId: number,
    firebaseId: string,
    fromDate: string,
    toDate: string,
  ): Promise<void> {
    const runStartedAt = new Date();
    try {
      const result = await this.gmailDriveImportService.importFromGmail(firebaseId, {
        query: this.buildDateRangeQuery(fromDate, toDate),
        // No maxMessages: the reader pages through the entire range.
        includeFileDetails: false,
      });

      // Cursor for the nightly sync. End of the imported range is the day
      // AFTER toDate at midnight; but when toDate is today, mail keeps
      // arriving after the scan — so never place the cursor past the moment
      // this run started. (Boundary slop is absorbed by content-hash dedup.)
      const rangeEnd = new Date(`${this.dayAfter(toDate)}T00:00:00Z`);
      const lastSuccessfulSyncAt = runStartedAt < rangeEnd ? runStartedAt : rangeEnd;

      await this.userIntegrationsService.markSyncSuccess(integrationId, {
        lastSuccessfulSyncAt,
        initialImport: { fromDate, toDate },
      });
      this.logger.log(
        `Initial Gmail import finished for firebaseId=${firebaseId}: ` +
          `${result.imported} imported, ${result.alreadyImported} already imported, ` +
          `${result.skipped} skipped, ${result.messagesFailed} message(s) failed ` +
          `(${result.messagesFound} messages scanned)`,
      );
    } catch (error: any) {
      const reason = error?.message ?? String(error);
      this.logger.error(
        `Initial Gmail import failed for firebaseId=${firebaseId}: ${reason}`,
        error?.stack,
      );
      // Cursor and initialImportCompletedAt untouched — the user can retry.
      await this.userIntegrationsService
        .markSyncError(integrationId, reason)
        .catch((persistError) =>
          this.logger.error(
            `Could not persist sync error for integration ${integrationId}: ${persistError}`,
          ),
        );
    }
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
