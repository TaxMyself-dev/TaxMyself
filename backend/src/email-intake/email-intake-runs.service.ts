import { assertEmailIntakeScope, emailIntakeDevTestQuery } from './email-intake-scope';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmailIntakeStore, EmailRun } from './email-intake.store';
import { EmailIntakeStorage } from './email-intake.storage';
import {
  GmailReaderService,
  DEFAULT_GMAIL_QUERY,
} from '../integrations/services/gmail-reader.service';
import { UserIntegrationsService } from '../integrations/services/user-integrations.service';
import { DocumentImportService } from '../document-import/document-import.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../integrations/enums/integrations.enums';
import { UserIntegration } from '../integrations/entities/user-integration.entity';
import { EmailProviderError } from '../integrations/providers/email-provider.error';
@Injectable()
export class EmailIntakeRunsService {
  private running = false;
  private readonly logger = new Logger(EmailIntakeRunsService.name);
  constructor(
    readonly store: EmailIntakeStore,
    readonly reader: GmailReaderService,
    readonly integrations: UserIntegrationsService,
    readonly importer: DocumentImportService,
    readonly storage: EmailIntakeStorage,
  ) {}
  enabled() {
    return this.store.enabled();
  }
  async start(
    integration: UserIntegration,
    options: {
      businessNumber?: string;
      query?: string;
      type?: string;
      from?: string;
      to?: string;
    },
  ) {
    if (!this.enabled()) throw new Error('Durable Gmail disabled');
    assertEmailIntakeScope(integration.id);
    if (
      integration.status !== IntegrationStatus.ACTIVE ||
      integration.connectionBackend !== 'COMPOSIO'
    )
      throw new Error('Mailbox unavailable');
    const suppliedQuery = emailIntakeDevTestQuery() || options.query?.trim();
    if (
      suppliedQuery &&
      suppliedQuery !== DEFAULT_GMAIL_QUERY &&
      /(?:newer|older)_than:/.test(suppliedQuery)
    )
      throw new Error('Durable scans require a fixed date range');
    const now = Math.floor(Date.now() / 1000);
    const frozenQuery =
      !suppliedQuery || suppliedQuery === DEFAULT_GMAIL_QUERY
        ? 'has:attachment after:' + (now - 90 * 86400) + ' before:' + (now + 1)
        : suppliedQuery +
          (options.type === 'NIGHTLY' ? ' before:' + (now + 1) : '');
    const business = await this.importer.resolveEmailBusiness(
      integration.firebaseId,
      options.businessNumber,
    );
    assertEmailIntakeScope(integration.id, business);
    return this.store.createRun({
      owner: integration.firebaseId,
      business,
      integrationId: integration.id,
      query: frozenQuery,
      type: options.type || 'MANUAL',
      from: options.from,
      to: options.to,
    });
  }
  async startManual(
    owner: string,
    ids: number[],
    options: { businessNumber?: string; query?: string },
  ) {
    if (!ids.length) throw new Error('Mailbox selection required');
    const rows: UserIntegration[] = [];
    // Validate every account before creating any work.
    for (const id of new Set(ids)) {
      const row = await this.integrations.findOwnedByIdOrThrow(id, owner);
      if (
        row.status !== IntegrationStatus.ACTIVE ||
        row.connectionBackend !== 'COMPOSIO' ||
        !row.initialImportCompletedAt ||
        row.provider !== IntegrationProvider.GOOGLE
      )
        throw new Error('Mailbox unavailable');
      assertEmailIntakeScope(row.id);
      rows.push(row);
    }
    const runIds = [];
    for (const row of rows) runIds.push(await this.start(row, options));
    return { started: true, runIds };
  }
  async status(owner: string) {
    const runs = await this.store.runs(owner);
    return Promise.all(
      runs.map(async (run) => ({
        id: run.id,
        integrationId: run.integration_id,
        businessNumber: run.business_number,
        processingPaused: process.env.GMAIL_DURABLE_PROCESS_ENABLED !== 'true',
        query: run.query_text,
        ...(await this.store.summary(run)),
        ...(
          await this.store.query(
            'SELECT pull_state,processing_state,scan_state,error_code FROM email_import_runs WHERE id=? AND firebase_id=?',
            [run.id, owner],
          )
        )[0],
      })),
    );
  }
  @Cron('*/10 * * * * *', { name: 'durableGmailScan' })
  async tick() {
    if (
      !this.enabled() ||
      process.env.GMAIL_DURABLE_SCAN_ENABLED !== 'true' ||
      this.running
    )
      return;
    this.running = true;
    const runner = this.store.db.createQueryRunner();
    let held = false;
    try {
      await runner.connect();
      held =
        Number(
          (
            await runner.query('SELECT GET_LOCK(?,0) AS acquired', [
              'gmail-durable-scan',
            ])
          )[0]?.acquired,
        ) === 1;
      if (!held) return;
      for (const run of await this.store.runs())
        await this.step(run).catch(() =>
          this.logger.warn('Durable Gmail scan retained for retry'),
        );
    } finally {
      try {
        if (held)
          await runner.query('SELECT RELEASE_LOCK(?)', ['gmail-durable-scan']);
      } finally {
        try {
          await runner.release();
        } finally {
          this.running = false;
        }
      }
    }
  }
  async step(run: EmailRun) {
    if (!this.enabled() || process.env.GMAIL_DURABLE_SCAN_ENABLED !== 'true')
      return;
    assertEmailIntakeScope(run.integration_id, run.business_number);
    const token = await this.store.leaseRun(run.id);
    if (!token) return;
    try {
      const integration = await this.integrations.findOwnedByIdOrThrow(
        run.integration_id,
        run.firebase_id,
      );
      if (integration.status !== IntegrationStatus.ACTIVE)
        throw new EmailProviderError('AUTH');
      // One metadata message + at most two file downloads per tick, never a total cap.
      for (const item of await this.store.items(run.id, 'message', 1)) {
        try {
          await this.store.recordParts(
            run,
            token,
            item,
            await this.reader.durableParts(integration, item.message_id),
          );
        } catch (error) {
          if (error instanceof EmailProviderError && error.category === 'AUTH')
            throw error;
          await this.store.retryItem(run, token, item, 'MESSAGE_RETRY');
        }
      }
      await Promise.all(
        (await this.store.items(run.id, 'part', 2)).map(async (item) => {
          try {
            const result = await this.storage.accept(
              run,
              item,
              await this.reader.durableDownload(
                integration,
                item.message_id,
                item.part_path,
              ),
            );
            await this.store.finishItem(
              run,
              token,
              item,
              result.duplicate ? 'DUPLICATE' : 'IMPORTED',
              result.id,
            );
          } catch (error) {
            await this.store.retryItem(
              run,
              token,
              item,
              'ATTACHMENT_RETRY',
              error?.intakeWorkId,
            );
          }
        }),
      );
      const summary = await this.store.summary(run);
      const unfinished =
        (summary.messages.DISCOVERED || 0) +
        (summary.messages.RETRY || 0) +
        (summary.attachments.DISCOVERED || 0) +
        (summary.attachments.RETRY || 0);
      const current = (
        await this.store.query(
          'SELECT * FROM email_import_runs WHERE id=? AND lease_token=?',
          [run.id, token],
        )
      )[0];
      if (!current) throw new Error('Run lease changed');
      if (!unfinished && current.scan_state !== 'DONE') {
        const page = await this.reader.durablePage(
          integration,
          run.query_text,
          current.page_token || undefined,
        );
        if (page.nextPageToken && page.nextPageToken === current.page_token)
          throw new EmailProviderError('CONTRACT');
        await this.store.savePage(run, token, page.ids, page.nextPageToken);
      }
      const status = await this.store.refreshRun(run);
      if (status.pull === 'COMPLETE' && run.sync_type !== 'MANUAL') {
        let cursor = new Date(run.started_at);
        const from =
          run.from_date instanceof Date
            ? run.from_date.toISOString().slice(0, 10)
            : String(run.from_date || '').slice(0, 10);
        const to =
          run.to_date instanceof Date
            ? run.to_date.toISOString().slice(0, 10)
            : String(run.to_date || '').slice(0, 10);
        if (run.sync_type === 'INITIAL' && to) {
          const rangeEnd = new Date(to + 'T00:00:00Z');
          rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
          if (rangeEnd < cursor) cursor = rangeEnd;
        }
        await this.integrations.markSyncSuccess(run.integration_id, {
          lastSuccessfulSyncAt: cursor,
          ...(run.sync_type === 'INITIAL'
            ? { initialImport: { fromDate: from, toDate: to } }
            : {}),
        });
        await this.store.query(
          'UPDATE email_import_runs SET integration_finalized_at=UTC_TIMESTAMP(3) WHERE id=? AND lease_token=?',
          [run.id, token],
        );
      }
      if (status.pull === 'PARTIAL')
        await this.integrations.markSyncError(
          run.integration_id,
          'Documents retained for manual handling; the mail cursor was not advanced.',
        );
    } catch (error) {
      const category =
        error instanceof EmailProviderError ? error.category : 'TRANSIENT';
      // Expired cursor: restart the frozen query; durable item identities/hash dedup survive.
      if (category === 'CONTRACT' && run.page_token)
        await this.store.query(
          "UPDATE email_import_runs SET page_token=NULL,page_history_json=NULL,scan_state='READY',pull_state=IF(scan_generation>=2,'PARTIAL','RETRY'),scan_generation=scan_generation+1,error_code='CURSOR_RESTART' WHERE id=? AND lease_token=?",
          [run.id, token],
        );
      else
        await this.store.query(
          "UPDATE email_import_runs SET pull_state='RETRY',attempts=attempts+1,error_code=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=? AND lease_token=?",
          [category, run.id, token],
        );
    } finally {
      await this.store.query(
        'UPDATE email_import_runs SET lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?',
        [run.id, token],
      );
    }
  }
}
