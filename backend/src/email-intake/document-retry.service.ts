import { analysisContext } from '../document-ai/document-ai.types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { capacityProfile } from '../document-ai/document-ai.capacity';
import { EmailIntakeStore } from './email-intake.store';
import { EmailRoutingService } from './email-routing.service';
import { emailWorkerScope } from './email-worker-scope';
import { documentRetryPlan, savedOutcome } from './document-retry.policy';

export interface DocumentRetryResult {
  fileId: string;
  status: string;
}
export interface DocumentRetrySummary {
  results: DocumentRetryResult[];
  retried: number;
  skipped: number;
  nextCursor?: number;
}
@Injectable()
export class DocumentRetryService {
  constructor(
    readonly db: DataSource,
    readonly drive: GoogleDriveService,
    readonly store: EmailIntakeStore,
    readonly routing: EmailRoutingService,
  ) {}

  private configuration() {
    try {
      const profile = capacityProfile();
      if (
        profile.provider !== 'anthropic' ||
        !process.env.ANTHROPIC_API_KEY?.trim()
      )
        throw new Error();
      return profile;
    } catch {
      throw new ServiceUnavailableException(
        'הגדרות ניתוח המסמכים אינן תקינות. יש לתקן אותן לפני ניסיון חוזר.',
      );
    }
  }
  private async business(owner: string, number: string) {
    const [business] = await this.db.query(
      'SELECT * FROM business WHERE firebaseId=? AND businessNumber=?',
      [owner, number],
    );
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }
  async retryFiles(
    owner: string,
    business: string,
    fileIds: unknown,
  ): Promise<DocumentRetrySummary> {
    if (
      typeof business !== 'string' ||
      !business.trim() ||
      business.length > 32 ||
      !Array.isArray(fileIds) ||
      !fileIds.length ||
      fileIds.length > 100 ||
      fileIds.some(
        (id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(id),
      )
    )
      throw new BadRequestException('Select between 1 and 100 documents');
    this.configuration();
    await this.business(owner, business);
    return this.retryBatch(
      owner,
      [...new Set(fileIds)].map((fileId) => ({ fileId, business })),
    );
  }
  async retryMailbox(
    owner: string,
    integrationId: number,
    cursor = 0,
  ): Promise<DocumentRetrySummary> {
    if (!Number.isSafeInteger(cursor) || cursor < 0)
      throw new BadRequestException('Invalid retry cursor');
    this.configuration();
    const [account] = await this.db.query(
      'SELECT id FROM user_integrations WHERE id=? AND firebase_id=? AND provider IN (?,?) AND status<>?',
      [integrationId, owner, 'GOOGLE', 'MICROSOFT', 'REVOKED'],
    );
    if (!account) throw new NotFoundException('Email account not found');
    const rows = await this.db.query(
      `SELECT DISTINCT d.id,d.drive_file_id,d.business_number FROM imported_documents d
      JOIN email_import_runs r ON r.id=d.email_run_id AND r.firebase_id=d.firebase_id
      WHERE d.firebase_id=? AND r.integration_id=? AND d.email_work_state='WORK_BLOCKED' AND d.id>?
      ORDER BY d.id LIMIT 101`,
      [owner, integrationId, cursor],
    );
    const page = rows.slice(0, 100);
    const result = await this.retryBatch(
      owner,
      page.map((d) => ({
        fileId: d.drive_file_id,
        business: d.business_number,
      })),
    );
    if (rows.length > 100) result.nextCursor = Number(page[page.length - 1].id);
    return result;
  }
  private async retryBatch(
    owner: string,
    files: { fileId: string; business: string }[],
  ): Promise<DocumentRetrySummary> {
    const results: DocumentRetryResult[] = [];
    for (const file of files) {
      try {
        results.push({
          fileId: file.fileId,
          status: await this.retryOne(owner, file.business, file.fileId),
        });
      } catch {
        results.push({ fileId: file.fileId, status: 'FAILED' });
      }
    }
    const retried = results.filter((r) =>
      ['REQUEUED', 'RESUMED', 'EXISTING_RESULT'].includes(r.status),
    ).length;
    return { results, retried, skipped: results.length - retried };
  }
  private async retryOne(
    owner: string,
    businessNumber: string,
    fileId: string,
  ): Promise<string> {
    const business = await this.business(owner, businessNumber);
    const runner = this.db.createQueryRunner();
    const lock =
      'inbox-ocr:' +
      createHash('sha256')
        .update(owner + '\0' + businessNumber)
        .digest('hex')
        .slice(0, 48);
    let locked = false;
    try {
      await runner.connect();
      locked =
        Number(
          (await runner.query('SELECT GET_LOCK(?,0) acquired', [lock]))[0]
            ?.acquired,
        ) === 1;
      if (!locked) return 'BUSY';
      await runner.startTransaction();
      const query = (sql: string, params: any[] = []) =>
        runner.manager.query(sql, params);
      const retainedImport = (
        await query(
          'SELECT *, (email_lease_token IS NOT NULL AND email_lease_expires_at>UTC_TIMESTAMP(3)) live_lease FROM imported_documents WHERE firebase_id=? AND business_number=? AND drive_file_id=? FOR UPDATE',
          [owner, businessNumber, fileId],
        )
      )[0];
      const work =
        retainedImport?.email_work_state === 'LEGACY' ? null : retainedImport;
      if (work?.email_run_id) {
        const [run] = await query(
          'SELECT * FROM email_import_runs WHERE id=? AND firebase_id=?',
          [work.email_run_id, owner],
        );
        const scope = emailWorkerScope();
        if (!run || (scope && run.worker_scope !== scope))
          return 'OTHER_WORKER';
        await this.routing.assertImportedAllowed(
          owner,
          work.id,
          runner.manager,
        );
      }
      const jobs = await query(
        `SELECT *, (lease_token IS NOT NULL AND lease_expires_at>UTC_TIMESTAMP(3)) live_lease
        FROM document_processing_jobs WHERE owner=? AND business=? AND (drive_file_id=? ${
          work ? 'OR content_hash=?' : ''
        })
        AND purpose<>'FORM_FILL' ORDER BY sequence FOR UPDATE`,
        [owner, businessNumber, fileId, ...(work ? [work.content_hash] : [])],
      );
      if (!work && !jobs.length) return 'NOT_FOUND';
      if (jobs.some((j) => j.drive_file_id !== fileId)) return 'NOT_RETRYABLE';
      const claims = await query(
        `SELECT e.* FROM extracted_document e JOIN user u ON u.\`index\`=e.user_id
        WHERE u.firebaseId=? AND e.business_number=? AND e.drive_file_id=? ORDER BY e.sub_index FOR UPDATE`,
        [owner, businessNumber, fileId],
      );
      const plan = documentRetryPlan(work, jobs, claims);
      if (!['READY', 'SAVED_RESULT', 'EXISTING_RESULT'].includes(plan))
        return plan;
      if (work?.live_lease) return 'BUSY';
      const metadata = await this.drive.getIntakeFileMetadata(fileId);
      if (
        metadata.trashed ||
        metadata.parents?.length !== 1 ||
        ![
          business.drive_inbox_folder_id,
          business.drive_processed_folder_id,
        ].includes(metadata.parents[0])
      )
        return 'FILE_UNAVAILABLE';
      if (plan === 'EXISTING_RESULT') {
        if (
          !work ||
          claims.some(
            (c) =>
              !c.drive_file_md5 || c.drive_file_md5 !== metadata.md5Checksum,
          )
        )
          return 'CONTENT_CHANGED';
        await query(
          `UPDATE imported_documents SET email_work_state='MOVE_PROCESSED',email_ai_state='EXISTING_RESULT',
          email_claim_id=?,email_error_code=NULL,email_attempts=0,email_next_at=NULL,email_lease_token=NULL,email_lease_expires_at=NULL
          WHERE id=? AND firebase_id=? AND business_number=?`,
          [claims[0].id, work.id, owner, businessNumber],
        );
      } else if (
        plan === 'SAVED_RESULT' &&
        savedOutcome(work?.email_result_json)
      ) {
        if (
          !claims.some(
            (c) =>
              c.id === work.email_claim_id &&
              ['processing', 'pending_review'].includes(c.status),
          )
        )
          return 'UNKNOWN_OUTCOME';
        await query(
          `UPDATE imported_documents SET email_work_state='RESULT_SAVED',email_attempts=0,email_error_code=NULL,
          email_next_at=NULL,email_lease_token=NULL,email_lease_expires_at=NULL WHERE id=? AND firebase_id=? AND business_number=?`,
          [work.id, owner, businessNumber],
        );
      } else {
        const job =
          plan === 'SAVED_RESULT'
            ? jobs.find((j) => j.state !== 'COMPLETED' && savedOutcome(j.result_json))
            : jobs.find((j) => ['BLOCKED', 'FAILED'].includes(j.state));
        if (job) {
          const profile = this.configuration();
          if (
            job.provider !== profile.provider ||
            job.model !== profile.model ||
            job.capacity_key !== profile.key
          )
            return 'CONFIGURATION_MISMATCH';
          if (work && (job.purpose !== 'GMAIL' || Number(analysisContext(job.context_json).importId) !== work.id)) return 'NOT_RETRYABLE';
          if (
            plan === 'SAVED_RESULT' &&
            claims.some((c) => c.status === 'error')
          )
            return 'UNKNOWN_OUTCOME';
          await query(
            `UPDATE document_processing_jobs SET state=?,attempts=IF(?='READY',0,attempts),completion_attempts=0,error_code=NULL,next_at=NULL,
            lease_token=NULL,lease_expires_at=NULL,finished_at=NULL WHERE id=? AND owner=? AND business=?`,
            [
              plan === 'SAVED_RESULT' ? 'RESULT_SAVED' : 'READY',
              plan === 'SAVED_RESULT' ? 'RESULT_SAVED' : 'READY',
              job.id,
              owner,
              businessNumber,
            ],
          );
        }
        if (work)
          await query(
            `UPDATE imported_documents SET email_work_state=?,email_attempts=0,email_error_code=NULL,
          email_next_at=NULL,email_lease_token=NULL,email_lease_expires_at=NULL WHERE id=? AND firebase_id=? AND business_number=?`,
            [job ? 'AI_QUEUED' : 'READY', work.id, owner, businessNumber],
          );
        if (!work && !job) return 'NOT_RETRYABLE';
      }
      await runner.commitTransaction();
      if (work?.email_run_id) {
        const [run] = await this.db.query(
          'SELECT * FROM email_import_runs WHERE id=? AND firebase_id=?',
          [work.email_run_id, owner],
        );
        if (run) await this.store.refreshRun(run);
      }
      return plan === 'READY'
        ? 'REQUEUED'
        : plan === 'EXISTING_RESULT'
        ? 'EXISTING_RESULT'
        : 'RESUMED';
    } finally {
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        try {
          if (locked) await runner.query('SELECT RELEASE_LOCK(?)', [lock]);
        } finally {
          await runner.release();
        }
      }
    }
  }
}
