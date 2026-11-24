import {
  emailWorkerScope,
  emailAnalysisScope,
} from '../email-intake/email-worker-scope';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import {
  AnalysisJob,
  AnalysisPurpose,
  AnalysisState,
  AnalysisOutcome,
  analysisContext,
} from './document-ai.types';
import {
  CapacityProfile,
  CapacityState,
  chooseJob,
  refill,
  reserve,
} from './document-ai.capacity';

export interface EnqueueAnalysis {
  owner: string;
  business: string;
  actor?: string;
  purpose: AnalysisPurpose;
  source: string;
  hash: string;
  filename: string;
  mimeType: string;
  size: number;
  policy: string;
  context?: Record<string, any>;
  contextKey?: string;
  expiresAt?: Date;
  fileId?: string;
  folderId?: string;
}
@Injectable()
export class DocumentAiStore {
  private readonly emailWorker = emailWorkerScope();
  constructor(readonly db: DataSource) {}
  private restoreJob(job: AnalysisJob, previous: AnalysisJob) {
    for (const key of Object.keys(job))
      if (!Object.prototype.hasOwnProperty.call(previous, key)) delete job[key];
    Object.assign(job, previous);
  }
  async query(
    sql: string,
    params: any[] = [],
    manager?: EntityManager,
  ): Promise<any> {
    try {
      return await (manager || this.db).query(sql, params);
    } catch {
      throw new ServiceUnavailableException(
        'Document analysis storage unavailable; reviewed schema is required',
      );
    }
  }
  async enqueue(
    input: EnqueueAnalysis,
    profile: CapacityProfile,
    manager?: EntityManager,
  ): Promise<AnalysisJob> {
    if (!input.owner || !input.business || !/^[a-f0-9]{64}$/.test(input.hash))
      throw new Error('Invalid analysis identity');
    const identity = createHash('sha256')
      .update(
        JSON.stringify([
          input.owner,
          input.business,
          input.hash,
          input.purpose,
          input.policy,
          input.contextKey || '',
        ]),
      )
      .digest('hex');
    await this.query(
      `INSERT IGNORE INTO document_processing_jobs
      (id,identity_key,owner,business,actor,purpose,source,content_hash,filename,mime_type,size,provider,model,policy_version,capacity_key,interactive,context_json,state,drive_file_id,drive_folder_id,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        identity,
        input.owner,
        input.business,
        input.actor || input.owner,
        input.purpose,
        input.source,
        input.hash,
        input.filename,
        input.mimeType,
        input.size,
        profile.provider,
        profile.model,
        input.policy,
        profile.key,
        ['FORM_FILL', 'TRANSACTION_LINK'].includes(input.purpose) ? 1 : 0,
        JSON.stringify(input.context || {}),
        input.fileId ? 'READY' : 'UPLOADING',
        input.fileId || null,
        input.folderId || null,
        input.expiresAt || null,
      ],
      manager,
    );
    const rows = await this.query(
      'SELECT * FROM document_processing_jobs WHERE identity_key=? AND owner=? AND business=?',
      [identity, input.owner, input.business],
      manager,
    );
    if (rows.length !== 1)
      throw new Error('Analysis identity reservation failed');
    return rows[0];
  }
  async get(
    id: string,
    owner: string,
    business: string,
    manager?: EntityManager,
  ): Promise<AnalysisJob> {
    const rows = await this.query(
      'SELECT * FROM document_processing_jobs WHERE id=? AND owner=? AND business=?',
      [id, owner, business],
      manager,
    );
    if (!rows[0]) throw new NotFoundException('Analysis not found');
    return rows[0];
  }
  async canonicalFile(
    owner: string,
    business: string,
    hash: string,
  ): Promise<{ driveFileId: string; driveFolderId: string } | null> {
    const rows = await this.query(
      "SELECT drive_file_id AS driveFileId,drive_folder_id AS driveFolderId FROM document_processing_jobs WHERE owner=? AND business=? AND content_hash=? AND purpose<>'FORM_FILL' AND drive_file_id IS NOT NULL ORDER BY sequence LIMIT 1",
      [owner, business, hash],
    );
    return rows[0] || null;
  }
  async retryMissingUpload(job: AnalysisJob): Promise<AnalysisJob> {
    await this.query(
      "UPDATE document_processing_jobs SET state='UPLOADING',error_code=NULL,next_at=NULL WHERE id=? AND owner=? AND business=? AND state='BLOCKED' AND error_code='UPLOAD_NOT_FOUND_REUPLOAD_REQUIRED' AND drive_file_id IS NULL",
      [job.id, job.owner, job.business],
    );
    return this.get(job.id, job.owner, job.business);
  }
  async resumeCompletedLink(job: AnalysisJob): Promise<AnalysisJob> {
    await this.query(
      "UPDATE document_processing_jobs SET state='RESULT_SAVED',completion_json=JSON_OBJECT('persistenceComplete',TRUE,'documentId',claim_id),completion_attempts=0,error_code=NULL,next_at=NULL,finished_at=NULL WHERE id=? AND owner=? AND business=? AND purpose='TRANSACTION_LINK' AND state='COMPLETED' AND result_json IS NOT NULL",
      [job.id, job.owner, job.business],
    );
    return this.get(job.id, job.owner, job.business);
  }
  async bindUpload(
    job: AnalysisJob,
    fileId: string,
    folderId: string,
  ): Promise<AnalysisJob> {
    const result = await this.query(
      "UPDATE document_processing_jobs SET drive_file_id=?,drive_folder_id=?,state='READY',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND owner=? AND business=? AND state='UPLOADING' AND drive_file_id IS NULL AND lease_token=?",
      [fileId, folderId, job.id, job.owner, job.business, job.lease_token],
    );
    const current = await this.get(job.id, job.owner, job.business);
    if (result.affectedRows !== 1 && current.drive_file_id !== fileId)
      throw new Error('Analysis upload already bound');
    return current;
  }
  async claimUpload(job: AnalysisJob): Promise<AnalysisJob | null> {
    const scope = emailAnalysisScope(this.emailWorker);
    const token = randomUUID();
    const result = await this.query(
      "UPDATE document_processing_jobs SET lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE) WHERE id=? AND owner=? AND business=? AND state='UPLOADING' AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))" +
        scope.sql,
      [token, job.id, job.owner, job.business, ...scope.params],
    );
    return result.affectedRows === 1 ? { ...job, lease_token: token } : null;
  }
  async unfinishedUploads(): Promise<AnalysisJob[]> {
    const scope = emailAnalysisScope(this.emailWorker);
    return this.query(
      "SELECT * FROM document_processing_jobs WHERE state='UPLOADING' AND updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))" +
        scope.sql +
        ' ORDER BY sequence LIMIT 10',
      scope.params,
    );
  }
  async pendingForBusiness(
    owner: string,
    business: string,
  ): Promise<AnalysisJob[]> {
    return this.query(
      "SELECT * FROM document_processing_jobs WHERE owner=? AND business=? AND purpose<>'FORM_FILL' AND state<>'COMPLETED' ORDER BY sequence",
      [owner, business],
    );
  }
  private async lockedCapacity(
    p: CapacityProfile,
    manager: EntityManager,
  ): Promise<{ state: CapacityState; now: number }> {
    await this.query(
      'INSERT IGNORE INTO document_ai_capacity (capacity_key,state_json) VALUES (?,NULL)',
      [p.key],
      manager,
    );
    const [row] = await this.query(
      'SELECT state_json FROM document_ai_capacity WHERE capacity_key=? FOR UPDATE',
      [p.key],
      manager,
    );
    const [clock] = await this.query(
      'SELECT ROUND(UNIX_TIMESTAMP(NOW(3))*1000) AS now_ms',
      [],
      manager,
    );
    const now = Number(clock.now_ms);
    return {
      state: refill(
        p,
        row.state_json ? (analysisContext(row.state_json) as any) : null,
        now,
      ),
      now,
    };
  }
  private async saveCapacity(
    p: CapacityProfile,
    state: CapacityState,
    m: EntityManager,
  ) {
    await this.query(
      'UPDATE document_ai_capacity SET state_json=? WHERE capacity_key=?',
      [JSON.stringify(state), p.key],
      m,
    );
  }
  async claimNext(p: CapacityProfile): Promise<AnalysisJob | null> {
    const scope = emailAnalysisScope(this.emailWorker, 'q');
    const claimScope = emailAnalysisScope(this.emailWorker);
    return this.db.transaction(async (m) => {
      // Serialize admission across provider groups as well, so compatible content cannot be paid twice.
      await this.query(
        "INSERT IGNORE INTO document_ai_capacity (capacity_key,state_json) VALUES ('__document_analysis_admission__',NULL)",
        [],
        m,
      );
      await this.query(
        "SELECT capacity_key FROM document_ai_capacity WHERE capacity_key='__document_analysis_admission__' FOR UPDATE",
        [],
        m,
      );
      const { state } = await this.lockedCapacity(p, m);
      const [count] = await this.query(
        "SELECT COUNT(*) AS active FROM document_processing_jobs WHERE state IN ('PREPARING','IN_FLIGHT','RESULT_SAVED','COMPLETING') AND lease_expires_at>UTC_TIMESTAMP(3)",
        [],
        m,
      );
      if (Number(count.active) >= Math.min(2, p.concurrency)) return null;
      // One head per tenant and lane: a large first tenant cannot hide competitors behind LIMIT.
      const heads = await this.query(
        `SELECT j.* FROM document_processing_jobs j JOIN
        (SELECT MIN(q.sequence) AS head FROM document_processing_jobs q WHERE q.capacity_key=? AND q.provider=? AND q.state='READY'
         AND (q.next_at IS NULL OR q.next_at<=UTC_TIMESTAMP(3)) AND (q.expires_at IS NULL OR q.expires_at>UTC_TIMESTAMP(3))
         AND NOT EXISTS (SELECT 1 FROM document_processing_jobs active WHERE active.owner=q.owner AND active.business=q.business AND active.content_hash=q.content_hash
           AND active.policy_version=q.policy_version AND active.state IN ('PREPARING','IN_FLIGHT') AND active.lease_expires_at>UTC_TIMESTAMP(3))
         ${scope.sql}
         GROUP BY q.owner,q.business,q.interactive) h ON h.head=j.sequence
        ORDER BY j.sequence`,
        [p.key, p.provider, ...scope.params],
        m,
      );
      const selected = chooseJob(heads, state);
      if (!selected.job) return null;
      const token = randomUUID(),
        j = selected.job;
      const result = await this.query(
        "UPDATE document_processing_jobs SET state='PREPARING',lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE),attempts=attempts+1,started_at=COALESCE(started_at,UTC_TIMESTAMP(3)) WHERE id=? AND state='READY'" +
          claimScope.sql,
        [token, j.id, ...claimScope.params],
        m,
      );
      if (result.affectedRows !== 1) throw new Error('Analysis claim raced');
      await this.saveCapacity(p, selected.state, m);
      return {
        ...j,
        state: 'PREPARING',
        lease_token: token,
        attempts: j.attempts + 1,
      } as AnalysisJob;
    });
  }
  async reusableResult(job: AnalysisJob): Promise<AnalysisOutcome | null> {
    const rows = await this.query(
      "SELECT result_json FROM document_processing_jobs WHERE owner=? AND business=? AND content_hash=? AND policy_version=? AND id<>? AND state IN ('RESULT_SAVED','COMPLETING','COMPLETED') AND result_json IS NOT NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP(3)) ORDER BY sequence LIMIT 1",
      [job.owner, job.business, job.content_hash, job.policy_version, job.id],
    );
    return rows[0] ? (analysisContext(rows[0].result_json) as any) : null;
  }
  async admit(
    job: AnalysisJob,
    p: CapacityProfile,
    input: number,
    output: number,
  ): Promise<boolean> {
    if (job.provider !== p.provider || job.capacity_key !== p.key)
      throw new Error('Wrong provider capacity group');
    const previous = { ...job };
    try {
      return await this.db.transaction(async (m) => {
        const { state, now } = await this.lockedCapacity(p, m);
        const current = await this.get(job.id, job.owner, job.business, m);
        if (
          current.lease_token !== job.lease_token ||
          current.state !== 'PREPARING' ||
          current.attempt_id
        )
          throw new Error('Analysis admission fence changed');
        const decision = reserve(p, state, input, output, now);
        if (decision.oversized) {
          await this.patch(
            job,
            {
              state: 'BLOCKED',
              error_code: 'TOKEN_ESTIMATE_EXCEEDS_CAPACITY',
              lease_token: null,
              lease_expires_at: null,
            },
            m,
          );
          return false;
        }
        if (decision.waitMs) {
          await this.patch(
            job,
            {
              state: 'READY',
              next_at: new Date(now + decision.waitMs),
              lease_token: null,
              lease_expires_at: null,
            },
            m,
          );
          await this.saveCapacity(p, decision.state, m);
          return false;
        }
        const attempt = randomUUID();
        await this.patch(
          job,
          {
            state: 'IN_FLIGHT',
            attempt_id: attempt,
            reserved_input: input,
            reserved_output: output,
            ai_started_at: new Date(now),
          },
          m,
        );
        await this.saveCapacity(p, decision.state, m);
        job.attempt_id = attempt;
        return true;
      });
    } catch (error) {
      this.restoreJob(job, previous);
      throw error;
    }
  }
  async patch(
    job: AnalysisJob,
    values: Record<string, any>,
    m?: EntityManager,
  ): Promise<void> {
    const allowed = new Set([
      'state',
      'error_code',
      'lease_token',
      'lease_expires_at',
      'next_at',
      'attempt_id',
      'reserved_input',
      'reserved_output',
      'ai_started_at',
      'claim_id',
      'result_json',
      'completion_json',
      'finished_at',
      'usage_json',
      'timings_json',
    ]);
    const keys = Object.keys(values);
    if (!keys.length || keys.some((k) => !allowed.has(k)))
      throw new Error('Invalid analysis update');
    const result = await this.query(
      'UPDATE document_processing_jobs SET ' +
        keys.map((k) => k + '=?').join(',') +
        ' WHERE id=? AND owner=? AND business=? AND lease_token=?',
      [
        ...keys.map((k) => values[k]),
        job.id,
        job.owner,
        job.business,
        job.lease_token,
      ],
      m,
    );
    if (result.affectedRows !== 1) throw new Error('Analysis lease changed');
    Object.assign(job, values);
  }
  async saveResult(
    job: AnalysisJob,
    p: CapacityProfile,
    outcome: AnalysisOutcome,
    timings: Record<string, number>,
  ) {
    const previous = { ...job };
    try {
      await this.db.transaction(async (m) => {
        const { state } = await this.lockedCapacity(p, m);
        const current = await this.get(job.id, job.owner, job.business, m);
        if (
          current.lease_token !== job.lease_token ||
          current.state !== 'IN_FLIGHT'
        )
          throw new Error('Analysis result fence changed');
        const row: any = current;
        if (outcome.usage) {
          // Reconcile reserved tokens, including overestimates and actual overruns. Missing usage earns no refund.
          state.input = Math.min(
            p.itpm,
            state.input +
              Number(row.reserved_input || 0) -
              outcome.usage.input -
              (outcome.usage.cacheWrite || 0),
          );
          state.output = Math.min(
            p.otpm,
            state.output +
              Number(row.reserved_output || 0) -
              outcome.usage.output,
          );
        }
        if (outcome.capacity) {
          const reported = outcome.capacity;
          if (Number.isFinite(reported.requestsRemaining))
            state.requests = Math.min(
              state.requests,
              Math.max(0, reported.requestsRemaining),
            );
          if (Number.isFinite(reported.inputRemaining))
            state.input = Math.min(
              state.input,
              Math.max(0, reported.inputRemaining),
            );
          if (Number.isFinite(reported.outputRemaining))
            state.output = Math.min(
              state.output,
              Math.max(0, reported.outputRemaining),
            );
          if (Number.isFinite(reported.blockedUntil))
            state.blockedUntil = Math.max(
              state.blockedUntil || 0,
              reported.blockedUntil,
            );
        }
        await this.patch(
          job,
          {
            state: 'RESULT_SAVED',
            result_json: JSON.stringify(outcome),
            usage_json: JSON.stringify(outcome.usage || null),
            timings_json: JSON.stringify(timings),
          },
          m,
        );
        await this.saveCapacity(p, state, m);
      });
    } catch (error) {
      this.restoreJob(job, previous);
      throw error;
    }
  }
  async rejectBeforeProcessing(
    job: AnalysisJob,
    p: CapacityProfile,
    code: string,
    seconds?: number,
  ) {
    const previous = { ...job };
    try {
      await this.db.transaction(async (m) => {
        const { state, now } = await this.lockedCapacity(p, m);
        const current = await this.get(job.id, job.owner, job.business, m);
        if (
          current.lease_token !== job.lease_token ||
          current.state !== 'IN_FLIGHT'
        )
          throw new Error('Rejected request lease changed');
        const row: any = current;
        state.requests = Math.min(p.rpm, state.requests + 1);
        state.input = Math.min(
          p.itpm,
          state.input + Number(row.reserved_input || 0),
        );
        state.output = Math.min(
          p.otpm,
          state.output + Number(row.reserved_output || 0),
        );
        const retry =
          code === 'RATE_LIMIT' && Number.isFinite(seconds) && seconds >= 0;
        if (retry)
          state.blockedUntil = Math.max(
            state.blockedUntil || 0,
            now + Math.max(1000, seconds * 1000),
          );
        await this.patch(
          job,
          {
            state: retry ? 'READY' : 'BLOCKED',
            attempt_id: null,
            error_code: code,
            next_at: retry ? new Date(state.blockedUntil) : null,
            lease_token: null,
            lease_expires_at: null,
          },
          m,
        );
        await this.saveCapacity(p, state, m);
      });
    } catch (error) {
      this.restoreJob(job, previous);
      throw error;
    }
  }
  async claimCompletion(p: CapacityProfile): Promise<AnalysisJob | null> {
    const scope = emailAnalysisScope(this.emailWorker);
    return this.db.transaction(async (m) => {
      // Serialize admission across provider groups as well, so compatible content cannot be paid twice.
      await this.query(
        "INSERT IGNORE INTO document_ai_capacity (capacity_key,state_json) VALUES ('__document_analysis_admission__',NULL)",
        [],
        m,
      );
      await this.query(
        "SELECT capacity_key FROM document_ai_capacity WHERE capacity_key='__document_analysis_admission__' FOR UPDATE",
        [],
        m,
      );
      await this.lockedCapacity(p, m);
      const [count] = await this.query(
        "SELECT COUNT(*) AS active FROM document_processing_jobs WHERE state IN ('PREPARING','IN_FLIGHT','RESULT_SAVED','COMPLETING') AND lease_expires_at>UTC_TIMESTAMP(3)",
        [],
        m,
      );
      if (Number(count.active) >= Math.min(2, p.concurrency)) return null;
      const rows = await this.query(
        "SELECT * FROM document_processing_jobs WHERE capacity_key=? AND state='RESULT_SAVED' AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3)) AND completion_attempts<5 AND (next_at IS NULL OR next_at<=UTC_TIMESTAMP(3)) " +
          scope.sql +
          ' ORDER BY sequence LIMIT 1 FOR UPDATE',
        [p.key, ...scope.params],
        m,
      );
      if (!rows[0]) return null;
      const job = rows[0] as AnalysisJob,
        token = randomUUID();
      const result = await this.query(
        "UPDATE document_processing_jobs SET state='COMPLETING',completion_attempts=completion_attempts+1,lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE) WHERE id=? AND state='RESULT_SAVED'" +
          scope.sql,
        [token, job.id, ...scope.params],
        m,
      );
      if (result.affectedRows !== 1)
        throw new Error('Completion claim changed');
      return {
        ...job,
        state: 'COMPLETING',
        lease_token: token,
        completion_attempts: Number(job.completion_attempts || 0) + 1,
      };
    });
  }
  async heartbeat(job: AnalysisJob) {
    const result = await this.query(
      'UPDATE document_processing_jobs SET lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE) WHERE id=? AND owner=? AND business=? AND lease_token=?',
      [job.id, job.owner, job.business, job.lease_token],
    );
    if (result.affectedRows !== 1)
      throw new Error('Analysis heartbeat lost its lease');
  }
  async recoverExpired() {
    const scope = emailAnalysisScope(this.emailWorker);
    // Never replay a possibly paid attempt. Source files and saved outcomes are retained.
    await this.query(
      "UPDATE document_processing_jobs SET state='UNKNOWN',error_code='AI_UNKNOWN_OUTCOME',lease_token=NULL,lease_expires_at=NULL WHERE state='IN_FLIGHT' AND lease_expires_at<UTC_TIMESTAMP(3)" +
        scope.sql +
        ' LIMIT 100',
      scope.params,
    );
    await this.query(
      "UPDATE document_processing_jobs SET state='READY',lease_token=NULL,lease_expires_at=NULL WHERE state='PREPARING' AND attempt_id IS NULL AND lease_expires_at<UTC_TIMESTAMP(3)" +
        scope.sql +
        ' LIMIT 100',
      scope.params,
    );
    await this.query(
      "UPDATE document_processing_jobs SET state='RESULT_SAVED',lease_token=NULL,lease_expires_at=NULL WHERE state='COMPLETING' AND lease_expires_at<UTC_TIMESTAMP(3)" +
        scope.sql +
        ' LIMIT 100',
      scope.params,
    );
    await this.query(
      "UPDATE document_processing_jobs SET state='BLOCKED',error_code='FORM_EXPIRED' WHERE purpose='FORM_FILL' AND state='READY' AND expires_at<UTC_TIMESTAMP(3) LIMIT 100",
    );
  }
  async markPassword(job: AnalysisJob) {
    await this.query(
      "UPDATE document_processing_jobs SET state='PASSWORD_REQUIRED',error_code='PASSWORD_REQUIRED' WHERE id=? AND owner=? AND business=? AND state='READY' AND lease_token IS NULL",
      [job.id, job.owner, job.business],
    );
    return this.get(job.id, job.owner, job.business);
  }
  async expiredPrefills(): Promise<AnalysisJob[]> {
    return this.query(
      "SELECT * FROM document_processing_jobs WHERE purpose='FORM_FILL' AND expires_at<UTC_TIMESTAMP(3) AND state IN ('COMPLETED','BLOCKED','PASSWORD_REQUIRED','UNKNOWN','FAILED') AND cleanup_state NOT IN ('DONE','SHARED','ATTENTION') AND (next_at IS NULL OR next_at<=UTC_TIMESTAMP(3)) AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3)) ORDER BY sequence LIMIT 10",
    );
  }
  async unreportedGmailFailures(): Promise<AnalysisJob[]> {
    const scope = emailAnalysisScope(this.emailWorker, 'j');
    return this.query(
      "SELECT j.* FROM document_processing_jobs j WHERE j.state IN ('UNKNOWN','BLOCKED','PASSWORD_REQUIRED') AND ((j.purpose='GMAIL' AND EXISTS (SELECT 1 FROM imported_documents d WHERE d.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(j.context_json,'$.importId')) AS UNSIGNED) AND d.firebase_id=j.owner AND d.business_number=j.business AND d.email_work_state='AI_QUEUED')) OR (j.purpose IN ('DOCUMENT','TRANSACTION_LINK') AND EXISTS (SELECT 1 FROM extracted_document e WHERE e.id=j.claim_id AND e.drive_file_id=j.drive_file_id AND e.status='processing')))" +
        scope.sql +
        ' ORDER BY j.sequence LIMIT 10',
      scope.params,
    );
  }
  async claimCleanup(job: AnalysisJob): Promise<AnalysisJob | null> {
    const token = randomUUID();
    const result = await this.query(
      "UPDATE document_processing_jobs SET lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE),cleanup_state='DELETING',cleanup_attempts=cleanup_attempts+1 WHERE id=? AND owner=? AND business=? AND purpose='FORM_FILL' AND expires_at<UTC_TIMESTAMP(3) AND state IN ('COMPLETED','BLOCKED','PASSWORD_REQUIRED','UNKNOWN','FAILED') AND cleanup_state NOT IN ('DONE','SHARED','ATTENTION') AND (next_at IS NULL OR next_at<=UTC_TIMESTAMP(3)) AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))",
      [token, job.id, job.owner, job.business],
    );
    return result.affectedRows === 1 ? { ...job, lease_token: token } : null;
  }
  async finishCleanup(
    job: AnalysisJob,
    status: 'DONE' | 'SHARED' | 'RETRY' | 'ATTENTION',
  ) {
    const result = await this.query(
      "UPDATE document_processing_jobs SET cleanup_state=IF(?='RETRY' AND cleanup_attempts>=5,'ATTENTION',?),result_json=NULL,completion_json=NULL,drive_file_id=IF(?='DONE',NULL,drive_file_id),filename=IF(?='DONE','expired',filename),next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),lease_token=NULL,lease_expires_at=NULL WHERE id=? AND owner=? AND business=? AND lease_token=?",
      [
        status,
        status,
        status,
        status,
        job.id,
        job.owner,
        job.business,
        job.lease_token,
      ],
    );
    if (result.affectedRows !== 1) throw new Error('Cleanup lease changed');
  }
}
