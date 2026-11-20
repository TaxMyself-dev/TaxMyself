import { parseEmailAiOutcome } from '../documents/email-ai-outcome';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID, createHash } from 'crypto';
import { Business } from '../business/business.entity';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { DocumentsService } from '../documents/documents.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { GMAIL_POLICY_VERSION } from '../documents/gmail-document-policy';
import { EmailIntakeStore, EmailWork } from './email-intake.store';
@Injectable()
export class EmailProcessingWorker {
  private running = false;
  private readonly logger = new Logger(EmailProcessingWorker.name);
  constructor(
    readonly store: EmailIntakeStore,
    readonly documents: DocumentsService,
    readonly drive: GoogleDriveService,
    @InjectRepository(Business) readonly businesses: Repository<Business>,
  ) {}
  enabled() {
    return (
      this.store.enabled() &&
      process.env.GMAIL_DURABLE_PROCESS_ENABLED === 'true'
    );
  }
  @Cron('*/5 * * * * *', { name: 'durableGmailProcessing' })
  async tick() {
    if (!this.enabled() || this.running) return;
    this.running = true;
    try {
      const due = await this.store.dueWork();
      const grouped = new Map<string, EmailWork[]>();
      for (const work of due) {
        const key = work.firebase_id + '\0' + work.business_number;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(work);
      }
      const queue = [...grouped.values()];
      await Promise.all(
        [0, 1].map(async (slot) => {
          const runner = this.store.db.createQueryRunner();
          let held = false;
          try {
            await runner.connect();
            held =
              Number(
                (
                  await runner.query('SELECT GET_LOCK(?,0) AS acquired', [
                    'gmail-durable-slot:' + slot,
                  ])
                )[0]?.acquired,
              ) === 1;
            if (!held) return;
            const deadline = Date.now() + 15000;
            while (queue.length && Date.now() < deadline) {
              const group = queue.shift();
              for (const work of group) {
                if (Date.now() >= deadline) break;
                await this.runOne(work).catch(() =>
                  this.logger.warn('Gmail processing retained for retry'),
                );
              }
            }
          } finally {
            try {
              if (held)
                await runner.query('SELECT RELEASE_LOCK(?)', [
                  'gmail-durable-slot:' + slot,
                ]);
            } finally {
              await runner.release();
            }
          }
        }),
      );
    } finally {
      this.running = false;
    }
  }
  async runOne(work: EmailWork) {
    if (!this.enabled()) return;
    if (process.env.GMAIL_DURABLE_DEV_TEST_SUBJECT !== undefined) await this.store.assertDevWorkScope(work);
    const runner = this.store.db.createQueryRunner();
    let locked = false;
    let token: string;
    const lock =
      'inbox-ocr:' +
      createHash('sha256')
        .update(work.firebase_id + '\0' + work.business_number)
        .digest('hex')
        .slice(0, 48);
    try {
      await runner.connect();
      locked =
        Number(
          (await runner.query('SELECT GET_LOCK(?,0) AS acquired', [lock]))[0]
            ?.acquired,
        ) === 1;
      if (!locked) return;
      token = await this.store.claimWork(work);
      if (!token) return;
      work.email_lease_token = token;
      const business = await this.businesses.findOneBy({
        firebaseId: work.firebase_id,
        businessNumber: work.business_number,
      });
      if (
        !business ||
        business.firebaseId !== work.firebase_id ||
        !business.driveInboxFolderId ||
        !business.driveProcessedFolderId
      )
        throw new Error('Business scope mismatch');
      if (work.email_work_state === 'MOVE_PENDING') {
        const metadata = await this.drive.getIntakeFileMetadata(
          work.drive_file_id,
        );
        const parents = metadata.parents || [];
        if (
          parents.length !== 1 ||
          ![work.drive_folder_id, business.driveInboxFolderId].includes(
            parents[0],
          )
        )
          throw new Error('File outside intake destination');
        if (parents[0] !== business.driveInboxFolderId)
          await this.drive.moveFile(
            work.drive_file_id,
            parents[0],
            business.driveInboxFolderId,
          );
        await this.store.updateWork(work, token, {
          drive_folder_id: business.driveInboxFolderId,
          email_work_state: 'READY',
        });
      }
      if (['READY', 'AI_PREPARED'].includes(work.email_work_state)) {
        const scopedFile = await this.drive.getIntakeFileMetadata(
          work.drive_file_id,
        );
        if (
          scopedFile.trashed ||
          scopedFile.parents?.length !== 1 ||
          ![
            business.driveInboxFolderId,
            business.driveProcessedFolderId,
          ].includes(scopedFile.parents[0])
        )
          throw new Error('AI file outside business inbox');
        const context = await this.documents.prepareEmailWork(
          work,
          token,
          scopedFile.parents[0] === business.driveInboxFolderId,
        );
        if (!context.alreadyHandled) {
          await this.store.updateWork(work, token, {
            email_work_state: 'AI_PREPARED',
            email_ai_attempt_id: work.email_ai_attempt_id || randomUUID(),
            email_policy_version: GMAIL_POLICY_VERSION,
          });
          // Persist the external-call boundary BEFORE sending. No transparent replay.
          await this.store.updateWork(work, token, {
            email_work_state: 'AI_IN_FLIGHT',
            email_ai_state: 'SENT',
          });
          let outcome: any;
          try {
            outcome = await this.documents.extractEmailWork(work, context);
          } catch {
            outcome = {
              intakeDecision: 'uncertain',
              invoices: null,
              rawResponse: null,
              technicalCode: 'AI_UNKNOWN_OUTCOME',
            };
          }
          await this.store.updateWork(work, token, {
            email_work_state: 'RESULT_SAVED',
            email_ai_state: 'RESULT_SAVED',
            email_result_json: JSON.stringify(outcome),
          });
          await this.documents.persistEmailWork(work, token, outcome, context);
        }
      } else if (work.email_work_state === 'AI_IN_FLIGHT') {
        const outcome = {
          intakeDecision: 'uncertain',
          invoices: null,
          rawResponse: null,
          technicalCode: 'AI_UNKNOWN_OUTCOME',
        };
        await this.store.updateWork(work, token, {
          email_work_state: 'RESULT_SAVED',
          email_ai_state: 'RESULT_SAVED',
          email_result_json: JSON.stringify(outcome),
        });
        await this.documents.persistEmailWork(work, token, outcome);
      } else if (work.email_work_state === 'RESULT_SAVED') {
        let outcome: any;
        try {
          outcome =
            typeof work.email_result_json === 'string'
              ? JSON.parse(work.email_result_json)
              : work.email_result_json;
        } catch {
          outcome = null;
        }
        if (!outcome)
          outcome = {
            intakeDecision: 'uncertain',
            invoices: null,
            technicalCode: 'INVALID_SAVED_OUTCOME',
          };
        await this.documents.persistEmailWork(work, token, outcome);
      }
      if (work.email_work_state === 'MOVE_PROCESSED') {
        const metadata = await this.drive.getIntakeFileMetadata(
          work.drive_file_id,
        );
        const parents = metadata.parents || [];
        if (
          parents.length !== 1 ||
          ![
            business.driveInboxFolderId,
            business.driveProcessedFolderId,
          ].includes(parents[0])
        )
          throw new Error('File outside processing destination');
        if (parents[0] !== business.driveProcessedFolderId)
          await this.drive.moveFile(
            work.drive_file_id,
            parents[0],
            business.driveProcessedFolderId,
          );
        await this.store.updateWork(work, token, {
          drive_folder_id: business.driveProcessedFolderId,
          email_work_state: 'AWAITING_APPROVAL',
          email_result_json: null,
        });
      }
      if (
        ['DELETE_PENDING', 'DELETE_RETRY'].includes(work.email_work_state) &&
        process.env.GMAIL_DURABLE_DELETE_ENABLED === 'true'
      )
        await this.deleteOne(work, token, business);
    } catch {
      if (token)
        await this.store.updateWork(work, token, {
          email_work_state:
            (work.email_attempts || 0) >= 4
              ? 'WORK_BLOCKED'
              : work.email_work_state,
          email_next_at: new Date(Date.now() + 60000),
          email_attempts: (work.email_attempts || 0) + 1,
          email_error_code: 'WORK_RETRY',
        });
    } finally {
      try {
        if (token)
          await this.store.query(
            'UPDATE imported_documents SET email_lease_token=NULL,email_lease_expires_at=NULL WHERE id=? AND email_lease_token=?',
            [work.id, token],
          );
      } finally {
        try {
          if (locked) await runner.query('SELECT RELEASE_LOCK(?)', [lock]);
        } finally {
          await runner.release();
        }
      }
      if (work.email_run_id) {
        const runs = await this.store.query(
          'SELECT * FROM email_import_runs WHERE id=? AND firebase_id=? AND business_number=?',
          [work.email_run_id, work.firebase_id, work.business_number],
        );
        if (runs[0]) await this.store.refreshRun(runs[0]);
      }
    }
  }
  async deleteOne(work: EmailWork, token: string, business: Business) {
    if (!this.enabled() || process.env.GMAIL_DURABLE_DELETE_ENABLED !== 'true')
      return;
    if (process.env.GMAIL_DURABLE_DEV_TEST_SUBJECT !== undefined) await this.store.assertDevWorkScope(work);
    let outcome: any;
    try {
      outcome =
        typeof work.email_result_json === 'string'
          ? JSON.parse(work.email_result_json)
          : work.email_result_json;
    } catch {
      throw new Error('Invalid saved decision');
    }
    if (
      parseEmailAiOutcome(outcome?.rawResponse || '', true).decision !==
        'not_accounting' ||
      work.source !== 'GMAIL' ||
      work.email_policy_version !== GMAIL_POLICY_VERSION ||
      business.firebaseId !== work.firebase_id ||
      business.businessNumber !== work.business_number ||
      work.email_decision !== 'NOT_ACCOUNTING' ||
      work.email_ai_state !== 'RESULT_SAVED' ||
      !outcome ||
      outcome.intakeDecision !== 'not_accounting' ||
      !Array.isArray(outcome.invoices) ||
      outcome.invoices.length ||
      !work.email_upload_tag
    )
      throw new Error('No deletion authorization');
    // Marking DELETE_PENDING already makes new import/approval links fail closed.
    const references = await this.store.query(
      `SELECT 'ledger' AS reason FROM imported_documents WHERE drive_file_id=? AND id<>?
    UNION ALL SELECT 'document' FROM extracted_document WHERE drive_file_id=? AND (id<>? OR confirmed_expense_id IS NOT NULL OR status='approved')
    UNION ALL SELECT 'expense' FROM expense WHERE source_document_id=? OR file LIKE ?
    UNION ALL SELECT 'protected' FROM protected_documents WHERE original_drive_id=?
    UNION ALL SELECT 'replacement' FROM document_replacement_operations WHERE candidate_drive_id=?`,
      [
        work.drive_file_id,
        work.id,
        work.drive_file_id,
        work.email_claim_id,
        work.email_claim_id,
        '%' + work.drive_file_id + '%',
        work.drive_file_id,
        work.drive_file_id,
      ],
    );
    if (references.length) {
      await this.store.updateWork(work, token, {
        email_work_state: 'DELETE_BLOCKED',
        email_error_code: 'FILE_REFERENCED',
      });
      return;
    }
    try {
      const meta = await this.drive.getIntakeFileMetadata(work.drive_file_id);
      if (
        meta.appProperties?.keepintaxProtectedOperation !==
          work.email_upload_tag ||
        meta.parents?.length !== 1 ||
        ![
          business.driveInboxFolderId,
          business.driveProcessedFolderId,
        ].includes(meta.parents[0])
      )
        throw new Error('Deletion ownership mismatch');
      const content = await this.drive.downloadFile(work.drive_file_id);
      if (
        createHash('sha256').update(content).digest('hex') !== work.content_hash
      ) {
        await this.store.updateWork(work, token, {
          email_work_state: 'DELETE_BLOCKED',
          email_error_code: 'CONTENT_CHANGED',
        });
        return;
      }
      const result = await this.drive.deleteIntakeFile(work.drive_file_id);
      if (result !== 'DELETED') {
        await this.store.updateWork(work, token, {
          email_work_state: 'DELETE_UNCONFIRMED',
          email_error_code: 'DELETION_UNCONFIRMED',
        });
        return;
      }
      await this.store.transaction(async (manager) => {
        const current = await this.store.work(
          work.id,
          work.firebase_id,
          work.business_number,
          manager,
        );
        if (current.email_lease_token !== token)
          throw new Error('Lease changed');
        await this.store.query(
          "UPDATE imported_documents SET email_work_state='DELETED',email_deleted_at=UTC_TIMESTAMP(3),drive_file_id=NULL,drive_file_name=NULL,drive_folder_id=NULL,email_result_json=NULL,gmail_subject=NULL,gmail_from=NULL,gmail_date=NULL,filename='removed',email_error_code=NULL WHERE id=? AND email_lease_token=?",
          [work.id, token],
          manager,
        );
        await this.store.query(
          'UPDATE email_import_items SET source_metadata_json=NULL,filename=NULL WHERE imported_document_id=?',
          [work.id],
          manager,
        );
        await this.store.query(
          "UPDATE extracted_document SET raw_response=NULL,drive_file_name='removed',deleted_at=COALESCE(deleted_at,UTC_TIMESTAMP(3)) WHERE id=? AND drive_file_id=? AND confirmed_expense_id IS NULL",
          [work.email_claim_id, work.drive_file_id],
          manager,
        );
      });
      work.email_work_state = 'DELETED';
    } catch {
      await this.store.updateWork(work, token, {
        email_work_state:
          work.email_attempts >= 4 ? 'DELETE_UNCONFIRMED' : 'DELETE_RETRY',
        email_next_at: new Date(Date.now() + 60000),
        email_error_code: 'DELETION_RETRY',
        email_attempts: (work.email_attempts || 0) + 1,
      });
    }
  }
}
