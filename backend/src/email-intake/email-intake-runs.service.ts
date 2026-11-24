import { Injectable, Logger, Optional, OnModuleDestroy } from '@nestjs/common';
import { EmailRoutingService } from './email-routing.service';
import { Cron } from '@nestjs/schedule';
import { QueryRunner } from 'typeorm';
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
import { EmailRuleBlockedError, EmailRulesChangedError } from './email-routing.policy';
import { EmailProviderError } from '../integrations/providers/email-provider.error';
@Injectable()
export class EmailIntakeRunsService implements OnModuleDestroy {
  private exclusiveRunner?: QueryRunner;
  private running = false;
  private readonly logger = new Logger(EmailIntakeRunsService.name);
  constructor(
    readonly store: EmailIntakeStore,
    readonly reader: GmailReaderService,
    readonly integrations: UserIntegrationsService,
    readonly importer: DocumentImportService,
    readonly storage: EmailIntakeStorage,
    @Optional() readonly routing?: EmailRoutingService,
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
    if (
      integration.status !== IntegrationStatus.ACTIVE ||
      integration.connectionBackend !== 'COMPOSIO'
    )
      throw new Error('Mailbox unavailable');
    const suppliedQuery = options.query?.trim();
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
    const mailboxBusiness = this.routing ? (await this.routing.initial(integration.firebaseId,integration.id)).initialBusiness : options.businessNumber;
    const business = await this.importer.resolveEmailBusiness(
      integration.firebaseId,
      mailboxBusiness,
    );
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
        ![IntegrationProvider.GOOGLE, IntegrationProvider.MICROSOFT].includes(
          row.provider,
        )
      )
        throw new Error('Mailbox unavailable');
      if(this.routing)await this.routing.initial(owner,row.id);
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
        query: run.query_text,
        startedAt: run.started_at,
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
    if (!this.enabled() || this.running) return;
    this.running = true;
    const exclusive = process.env.EMAIL_DEV_EXCLUSIVE_SCANNER === 'true';
    if (
      exclusive &&
      (process.env.NODE_ENV === 'production' ||
        process.env.COMPOSIO_ENVIRONMENT !== 'dev' ||
        process.env.DISABLE_SYNCHRONIZE !== 'true')
    ) {
      this.running = false;
      throw new Error(
        'Exclusive email scanner requires explicit safe DEV settings',
      );
    }
    const reused = Boolean(this.exclusiveRunner);
    const runner = this.exclusiveRunner || this.store.db.createQueryRunner();
    let held = false;
    try {
      if (!reused) await runner.connect();
      if (exclusive) {
        const [identity] = await runner.query('SELECT DATABASE() AS db');
        if (identity.db !== 'keepintax-dev')
          throw new Error('Exclusive email scanner requires keepintax-dev');
      }
      if (reused) {
        held =
          Number(
            (
              await runner.query(
                'SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS owned',
                ['gmail-durable-scan'],
              )
            )[0]?.owned,
          ) === 1;
      } else {
        held =
          Number(
            (
              await runner.query('SELECT GET_LOCK(?,0) AS acquired', [
                'gmail-durable-scan',
              ])
            )[0]?.acquired,
          ) === 1;
      }
      if (!held) return;
      if (exclusive && !reused) {
        this.exclusiveRunner = runner;
        this.logger.log(
          JSON.stringify({ event: 'email.scanner.dev_exclusive_acquired' }),
        );
      }
      for (const run of await this.store.runs())
        await this.step(run).catch(() =>
          this.logger.warn('Durable Gmail scan retained for retry'),
        );
    } finally {
      try {
        if (held && !exclusive)
          await runner.query('SELECT RELEASE_LOCK(?)', ['gmail-durable-scan']);
      } finally {
        try {
          if (!exclusive || !held) {
            if (this.exclusiveRunner === runner)
              this.exclusiveRunner = undefined;
            await runner.release();
          }
        } finally {
          this.running = false;
        }
      }
    }
  }
  async onModuleDestroy(): Promise<void> {
    const runner = this.exclusiveRunner;
    this.exclusiveRunner = undefined;
    if (!runner) return;
    try {
      await runner.query('SELECT RELEASE_LOCK(?)', ['gmail-durable-scan']);
    } finally {
      await runner.release();
    }
  }
  async step(run: EmailRun) {
    if (!this.enabled()) return;
    const token = await this.store.leaseRun(run.id);
    if (!token) return;
    let stage = 'load_integration';
    try {
      const integration = await this.integrations.findOwnedByIdOrThrow(
        run.integration_id,
        run.firebase_id,
      );
      if (integration.status !== IntegrationStatus.ACTIVE)
        throw new EmailProviderError('ACCESS', {
          providerCode: 'LOCAL_CONNECTION_UNVERIFIED',
        });
      if (integration.lastSyncStatus === 'ERROR')
        await this.integrations.markSyncRunning(integration.id);
      // One metadata message + at most two file downloads per tick, never a total cap.
      stage = 'load_message';
      for (const item of await this.store.items(run.id, 'message', 1)) {
        try {
          await this.store.recordParts(
            run,
            token,
            item,
            await this.reader.durableParts(integration, item.message_id),
          );
        } catch (error) {
          if (error instanceof EmailRuleBlockedError) {
            await this.store.finishItem(run,token,item,'FILTERED');
            continue;
          }
          if (
            error instanceof EmailProviderError &&
            ['AUTH', 'ACCESS', 'CONFIG'].includes(error.category)
          )
            throw error;
          this.logFailure(run, stage, error);
          await this.store.retryItem(run, token, item, 'MESSAGE_RETRY');
        }
      }
      stage = 'download_attachment';
      const partFailures: unknown[] = [];
      await Promise.all(
        (
          await this.store.items(run.id, 'part', 2)
        ).map(async (item) => {
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
            if (error instanceof EmailRuleBlockedError) {
              await this.store.finishItem(run,token,item,'FILTERED');
              return;
            }
            if (
              error instanceof EmailProviderError &&
              ['AUTH', 'ACCESS', 'CONFIG'].includes(error.category)
            ) {
              partFailures.push(error);
              return;
            }
            this.logFailure(run, stage, error);
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
      if (partFailures.length) throw partFailures[0];
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
        stage = 'list_messages';
        const page = await this.reader.durablePage(
          integration,
          run.query_text,
          current.page_token || undefined,
        );
        if (page.nextPageToken && page.nextPageToken === current.page_token)
          throw new EmailProviderError('CONTRACT');
        await this.store.savePage(run, token, page.ids, page.nextPageToken);
      }
      stage = 'refresh_run';
      const status = await this.store.refreshRun(run);
      stage = 'finalize_sync';
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
      if (status.pull === 'COMPLETE' && run.sync_type === 'MANUAL') {
        await this.integrations.finishManualSync(run.integration_id, false, undefined, run.started_at);
      }
      if (status.pull === 'PARTIAL')
        await this.integrations.markSyncError(
          run.integration_id,
          'Documents retained for manual handling; the mail cursor was not advanced.',
        );
    } catch (error) {
      if (error instanceof EmailRulesChangedError) {
        await this.store.query("UPDATE email_import_runs SET query_text=?,page_token=NULL,page_history_json=NULL,scan_state='READY',error_code='RULES_CHANGED' WHERE id=? AND lease_token=?",[error.query,run.id,token]);
        return;
      }
      const category =
        error instanceof EmailProviderError ? error.category : 'TRANSIENT';
      this.logFailure(run, stage, error);
      const terminal =
        ['AUTH', 'ACCESS', 'CONFIG'].includes(category) ||
        (run.attempts || 0) >= 4;
      const messageCode =
        error instanceof EmailProviderError &&
        error.details.providerCode === 'LOCAL_CONNECTION_UNVERIFIED'
          ? 'EMAIL_CONNECTION_UNVERIFIED'
          : category === 'AUTH'
          ? 'EMAIL_RECONNECT_REQUIRED'
          : category === 'ACCESS'
          ? 'EMAIL_ACCESS_DENIED'
          : category === 'CONFIG'
          ? 'EMAIL_CONFIGURATION'
          : terminal
          ? 'EMAIL_RETRY_EXHAUSTED'
          : 'EMAIL_RETRY_PENDING';
      // Expired cursor: restart the frozen query; durable item identities/hash dedup survive.
      if (category === 'CONTRACT' && run.page_token) {
        const transition = await this.store.query(
          "UPDATE email_import_runs SET page_token=NULL,page_history_json=NULL,scan_state='READY',pull_state=IF(scan_generation>=2,'PARTIAL','RETRY'),scan_generation=scan_generation+1,error_code='CURSOR_RESTART' WHERE id=? AND lease_token=?",
          [run.id, token],
        );
        if (transition?.affectedRows === 1)
          await this.integrations.markSyncError(
            run.integration_id,
            (run.scan_generation || 0) >= 2
              ? 'EMAIL_RETRY_EXHAUSTED'
              : 'EMAIL_RETRY_PENDING',
          );
      } else {
        const transition = await this.store.query(
          "UPDATE email_import_runs SET pull_state=?,attempts=attempts+1,error_code=?,next_attempt_at=IF(?='RETRY',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),NULL) WHERE id=? AND lease_token=?",
          [
            terminal ? 'PARTIAL' : 'RETRY',
            category,
            terminal ? 'PARTIAL' : 'RETRY',
            run.id,
            token,
          ],
        );
        if (transition?.affectedRows === 1)
          await this.integrations.markSyncError(
            run.integration_id,
            messageCode,
          );
      }
    } finally {
      await this.store.query(
        'UPDATE email_import_runs SET lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?',
        [run.id, token],
      );
    }
  }
  private logFailure(run: EmailRun, stage: string, error: unknown): void {
    const failure =
      error instanceof EmailProviderError
        ? error
        : new EmailProviderError('TRANSIENT');
    this.logger.warn(
      JSON.stringify({
        event: 'email.intake.failure',
        runId: run.id,
        integrationId: run.integration_id,
        stage,
        category: failure.category,
        httpStatus: failure.details.httpStatus,
        providerCode: failure.details.providerCode,
      }),
    );
  }
}
