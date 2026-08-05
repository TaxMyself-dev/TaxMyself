import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GmailSyncService } from './gmail-sync.service';
import { UserIntegrationsService } from './user-integrations.service';

/**
 * Bounded concurrency for the nightly batch. Deliberately small: unlike the
 * billing cron (one CardCom charge per user), each Gmail sync is itself many
 * API calls and Drive uploads.
 */
const BATCH_SIZE = 3;

export interface GmailNightlySyncSummary {
  eligible: number;
  succeeded: number;
  skipped: number;
  errors: number;
}

/**
 * Nightly Gmail sync for every user who completed the initial manual import.
 * Follows the billing cron architecture: thin @Cron wrapper, public batch
 * method (reusable by a future admin "run now" endpoint), per-user error
 * isolation via GmailSyncService.runIncrementalSync (which never throws).
 *
 * Eligibility (provider GOOGLE + status ACTIVE + initial import completed)
 * is queried in UserIntegrationsService; live-RUNNING rows are skipped inside
 * runIncrementalSync, where stale RUNNING markers are also recovered.
 */
@Injectable()
export class GmailSyncCronService {
  private readonly logger = new Logger(GmailSyncCronService.name);

  constructor(
    private readonly userIntegrationsService: UserIntegrationsService,
    private readonly gmailSyncService: GmailSyncService,
  ) {}

  /** Runs once a night at 02:00 Israel time (billing renewal runs at 03:00). */
  @Cron('0 2 * * *', { name: 'gmailNightlySyncCron', timeZone: 'Asia/Jerusalem' })
  async runNightlySyncCron(): Promise<void> {
    this.logger.log('Nightly Gmail sync cron starting');
    const summary = await this.processEligibleSyncs();
    this.logger.log(
      `Nightly Gmail sync cron complete: eligible=${summary.eligible} ` +
        `succeeded=${summary.succeeded} skipped=${summary.skipped} errors=${summary.errors}`,
    );
  }

  /**
   * Syncs every eligible integration in bounded-concurrency batches. Never
   * throws — each user's outcome is contained by runIncrementalSync.
   */
  async processEligibleSyncs(): Promise<GmailNightlySyncSummary> {
    const candidates = await this.userIntegrationsService.findGmailSyncCandidates();
    const summary: GmailNightlySyncSummary = {
      eligible: candidates.length,
      succeeded: 0,
      skipped: 0,
      errors: 0,
    };

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((integration) => this.gmailSyncService.runIncrementalSync(integration)),
      );
      for (const result of results) {
        if (result.outcome === 'success') summary.succeeded += 1;
        else if (result.outcome === 'skipped') summary.skipped += 1;
        else summary.errors += 1;
      }
    }

    return summary;
  }
}
