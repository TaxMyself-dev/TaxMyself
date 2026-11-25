import {
  emailWorkerScope,
  emailRunScope,
  emailWorkScope,
} from './email-worker-scope';
import { EmailProviderError } from '../integrations/providers/email-provider.error';
import {
  ConflictException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
export interface EmailRun {
  id: string;
  firebase_id: string;
  business_number: string;
  integration_id: number;
  sync_type: string;
  query_text: string;
  from_date?: string | Date;
  to_date?: string | Date;
  scan_state: string;
  page_token?: string;
  scan_generation: number;
  attempts?: number;
  lease_token?: string;
  started_at: Date;
}
export interface EmailItem {
  id: string;
  run_id: string;
  message_id: string;
  part_path: string;
  state: string;
  filename: string;
  mime_type: string;
  imported_document_id?: number;
  source_metadata_json?: any;
  attempts: number;
}
export interface EmailWork {
  email_routing_json?: any;
  source?: string;
  email_policy_version?: string;
  id: number;
  firebase_id: string;
  business_number: string;
  filename: string;
  mime_type: string;
  content_hash: string;
  drive_file_id: string;
  drive_folder_id: string;
  email_work_state: string;
  email_run_id: string;
  email_lease_token: string;
  email_ai_state: string;
  email_ai_attempt_id: string;
  email_result_json: any;
  email_claim_id: number;
  email_upload_tag: string;
  email_attempts: number;
  email_decision: string;
}
@Injectable()
export class EmailIntakeStore implements OnModuleInit {
  readonly workerScope = emailWorkerScope();
  async onModuleInit() {
    if (!this.workerScope) return;
    const [identity] = await this.db.query('SELECT DATABASE() AS db');
    if (identity?.db !== 'keepintax-dev')
      throw new Error('Email worker routing requires keepintax-dev');
    const columns = await this.db.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_import_runs' AND COLUMN_NAME='worker_scope'",
    );
    if (columns.length !== 1)
      throw new Error(
        'Email worker routing requires the reviewed worker_scope schema',
      );
  }

  constructor(readonly db: DataSource) {}
  enabled() {
    return true;
  }
  async query(
    sql: string,
    params: any[] = [],
    manager?: EntityManager,
  ): Promise<any> {
    if (!this.enabled())
      throw new ServiceUnavailableException('Durable Gmail intake disabled');
    try {
      return await (manager || this.db).query(sql, params);
    } catch {
      throw new ServiceUnavailableException(
        'Durable Gmail storage unavailable',
      );
    }
  }
  async transaction<T>(fn: (m: EntityManager) => Promise<T>): Promise<T> {
    if (!this.enabled())
      throw new ServiceUnavailableException('Durable Gmail intake disabled');
    return this.db.transaction(fn);
  }
  async createRun(input: {
    owner: string;
    business: string;
    integrationId: number;
    query: string;
    type: string;
    from?: string;
    to?: string;
  }) {
    return this.transaction(async (m) => {
      // Lock the stable connection row so simultaneous initial/manual requests cannot overlap.
      const account = (
        await this.query(
          'SELECT id,firebase_id,status FROM user_integrations WHERE id=? AND firebase_id=? FOR UPDATE',
          [input.integrationId, input.owner],
          m,
        )
      )[0];
      if (!account || account.status !== 'ACTIVE')
        throw new ServiceUnavailableException('Mailbox unavailable');
      const active = await this.query(
        'SELECT id' +
          (this.workerScope ? ',worker_scope' : '') +
          " FROM email_import_runs WHERE integration_id=? AND firebase_id=? AND pull_state IN ('RUNNING','RETRY') LIMIT 1",
        [input.integrationId, input.owner],
        m,
      );
      if (active.length) {
        if (this.workerScope && active[0].worker_scope !== this.workerScope)
          throw new ConflictException(
            'Mailbox work belongs to another worker scope',
          );
        return active[0].id;
      }
      const id = randomUUID();
      await this.query(
        'INSERT INTO email_import_runs (id,firebase_id,business_number,integration_id,sync_type,query_text,from_date,to_date' +
          (this.workerScope ? ',worker_scope' : '') +
          ') VALUES (?,?,?,?,?,?,?,?' +
          (this.workerScope ? ',?' : '') +
          ')',
        [
          id,
          input.owner,
          input.business,
          input.integrationId,
          input.type,
          input.query,
          input.from || null,
          input.to || null,
          ...(this.workerScope ? [this.workerScope] : []),
        ],
        m,
      );
      return id;
    });
  }
  async runs(owner?: string): Promise<EmailRun[]> {
    if (!this.enabled()) return [];
    const scope = emailRunScope(this.workerScope);
    return this.query(
      owner
        ? `SELECT r.* FROM email_import_runs r WHERE r.firebase_id=?${emailRunScope(this.workerScope,'r.worker_scope').sql} AND (
          r.pull_state IN ('RUNNING','RETRY') OR r.processing_state='RUNNING' OR
          r.id=(SELECT latest.id FROM email_import_runs latest
            WHERE latest.firebase_id=r.firebase_id AND latest.integration_id=r.integration_id${emailRunScope(this.workerScope,'latest.worker_scope').sql}
            ORDER BY latest.started_at DESC,latest.id DESC LIMIT 1)
        ) ORDER BY r.started_at DESC,r.id DESC`
        : "SELECT * FROM email_import_runs WHERE (pull_state IN ('RUNNING','RETRY') OR (pull_state='COMPLETE' AND sync_type<>'MANUAL' AND integration_finalized_at IS NULL)) AND (next_attempt_at IS NULL OR next_attempt_at<=UTC_TIMESTAMP(3))" + scope.sql + ' ORDER BY started_at LIMIT 2',
      owner ? [owner,...scope.params,...scope.params] : scope.params,
    );
  }
  async leaseRun(id: string) {
    const scope = emailRunScope(this.workerScope);
    const token = randomUUID();
    const result = await this.query(
      "UPDATE email_import_runs SET lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE id=? AND (pull_state IN ('RUNNING','RETRY') OR (pull_state='COMPLETE' AND sync_type<>'MANUAL' AND integration_finalized_at IS NULL)) AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))" +
        scope.sql,
      [token, id, ...scope.params],
    );
    return result.affectedRows === 1 ? token : null;
  }
  async fencedRun(run: EmailRun, token: string, m?: EntityManager) {
    const scope = emailRunScope(this.workerScope);
    const row = (
      await this.query(
        'SELECT * FROM email_import_runs WHERE id=? AND firebase_id=? AND business_number=?' +
          scope.sql +
          ' FOR UPDATE',
        [run.id, run.firebase_id, run.business_number, ...scope.params],
        m,
      )
    )[0];
    if (!row || row.lease_token !== token)
      throw new ServiceUnavailableException('Gmail run lease changed');
    return row;
  }
  async savePage(run: EmailRun, token: string, ids: string[], next?: string) {
    await this.transaction(async (m) => {
      const current = await this.fencedRun(run, token, m);
      const seen =
        typeof current.page_history_json === 'string'
          ? JSON.parse(current.page_history_json)
          : current.page_history_json || [];
      if (next && seen.includes(next)) throw new EmailProviderError('CONTRACT');
      if (next) seen.push(next);
      for (const id of new Set(ids))
        await this.query(
          "INSERT IGNORE INTO email_import_items (id,run_id,message_id,part_path) VALUES (?,?,?,'@message')",
          [randomUUID(), run.id, id],
          m,
        );
      await this.query(
        'UPDATE email_import_runs SET page_token=?,scan_state=?,page_history_json=? WHERE id=? AND lease_token=?',
        [
          next || null,
          next ? 'PAGING' : 'DONE',
          JSON.stringify(seen),
          run.id,
          token,
        ],
        m,
      );
    });
  }
  async items(
    runId: string,
    kind: 'message' | 'part',
    limit = 2,
  ): Promise<EmailItem[]> {
    return this.query(
      `SELECT * FROM email_import_items WHERE run_id=? AND part_path${
        kind === 'message' ? '=' : '<>'
      }'@message' AND state IN ('DISCOVERED','RETRY') AND (next_attempt_at IS NULL OR next_attempt_at<=UTC_TIMESTAMP(3)) ORDER BY created_at,id LIMIT ?`,
      [runId, Math.min(20, Math.max(1, limit))],
    );
  }
  async recordParts(
    run: EmailRun,
    token: string,
    message: EmailItem,
    parts: Array<{
      path: string;
      filename: string;
      mimeType: string;
      skip?: string;
      metadata?: Record<string, any>;
    }>,
  ) {
    await this.transaction(async (m) => {
      await this.fencedRun(run, token, m);
      for (const part of parts) {
        if(part.path.startsWith('link:')){
          // A new date-window run must not repeat paid/ambiguous attempts for the same source.
          const previous=await this.query("SELECT i.id FROM email_import_items i JOIN email_import_runs r ON r.id=i.run_id WHERE r.firebase_id=? AND r.integration_id=? AND i.message_id=? AND i.part_path=? AND i.state<>'FILTERED' AND i.run_id<>? LIMIT 1",[run.firebase_id,run.integration_id,message.message_id,part.path,run.id],m);
          if(previous.length)continue;
        }
        const known = part.skip
          ? []
          : await this.query(
              "SELECT i.imported_document_id FROM email_import_items i JOIN email_import_runs r ON r.id=i.run_id JOIN imported_documents d ON d.id=i.imported_document_id WHERE r.firebase_id=? AND d.firebase_id=r.firebase_id AND r.integration_id=? AND i.message_id=? AND i.part_path=? AND i.state IN ('IMPORTED','DUPLICATE') AND d.email_work_state<>'STAGING' ORDER BY i.created_at DESC LIMIT 1",
              [
                run.firebase_id,
                run.integration_id,
                message.message_id,
                part.path,
              ],
              m,
            );
        await this.query(
          'INSERT IGNORE INTO email_import_items (id,run_id,message_id,part_path,state,filename,mime_type,error_code,imported_document_id,source_metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [
            randomUUID(),
            run.id,
            message.message_id,
            part.path,
            part.skip ? 'FILTERED' : known[0] ? 'DUPLICATE' : 'DISCOVERED',
            part.filename,
            part.mimeType,
            part.skip || null,
            known[0]?.imported_document_id || null,
            JSON.stringify(part.metadata || {}),
          ],
          m,
        );
      }
      await this.query(
        "UPDATE email_import_items SET state='SCANNED',error_code=NULL WHERE id=? AND run_id=?",
        [message.id, run.id],
        m,
      );
    });
  }
  async finishItem(
    run: EmailRun,
    token: string,
    item: EmailItem,
    state: string,
    importId?: number,
    error?: string,
  ) {
    await this.transaction(async (m) => {
      await this.fencedRun(run, token, m);
      await this.query(
        'UPDATE email_import_items SET state=?,imported_document_id=?,error_code=? WHERE id=? AND run_id=?',
        [state, importId || null, error || null, item.id, run.id],
        m,
      );
    });
  }
  async beginLink(run:EmailRun,token:string,item:EmailItem){
    return this.transaction(async m=>{
      await this.fencedRun(run,token,m);
      const result=await this.query("UPDATE email_import_items SET state='BLOCKED',error_code='LINK_ATTEMPT_INTERRUPTED',attempts=attempts+1 WHERE id=? AND run_id=? AND state IN ('DISCOVERED','RETRY') AND part_path LIKE 'link:%'",[item.id,run.id],m);
      return result.affectedRows===1;
    });
  }
  async withLinkLock<T>(id:string,operation:()=>Promise<T>):Promise<T|null>{
    const runner=this.db.createQueryRunner();let held=false;await runner.connect();
    try{
      held=Number((await runner.query('SELECT GET_LOCK(?,0) AS acquired',['email-link-'+id]))[0]?.acquired)===1;
      return held?await operation():null;
    }finally{try{if(held)await runner.query('SELECT RELEASE_LOCK(?)',['email-link-'+id]);}finally{await runner.release();}}
  }
  async linkTelemetry(run:EmailRun,token:string,item:EmailItem,metrics:unknown){
    await this.transaction(async m=>{
      await this.fencedRun(run,token,m);
      await this.query("UPDATE email_import_items SET source_metadata_json=JSON_SET(COALESCE(source_metadata_json,JSON_OBJECT()),'$.linkDownloadMetrics',CAST(? AS JSON)) WHERE id=? AND run_id=?",[JSON.stringify(metrics),item.id,run.id],m);
    });
  }
  async retryItem(
    run: EmailRun,
    token: string,
    item: EmailItem,
    code: string,
    workId?: number,
  ) {
    await this.transaction(async (m) => {
      await this.fencedRun(run, token, m);
      if (Number.isSafeInteger(workId) && workId > 0) {
        await this.query(
          'UPDATE email_import_items SET imported_document_id=? WHERE id=? AND run_id=?',
          [workId, item.id, run.id],
          m,
        );
        await this.query(
          "UPDATE imported_documents SET email_work_state='WORK_BLOCKED',email_error_code='STORAGE_RETRY_EXHAUSTED' WHERE id=? AND firebase_id=? AND business_number=? AND email_work_state='STAGING' AND EXISTS (SELECT 1 FROM email_import_items WHERE id=? AND run_id=? AND attempts>=4)",
          [workId, run.firebase_id, run.business_number, item.id, run.id],
          m,
        );
      }
      await this.query(
        "UPDATE email_import_items SET state=IF(attempts>=4,'BLOCKED','RETRY'),attempts=attempts+1,error_code=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=? AND run_id=?",
        [code, item.id, run.id],
        m,
      );
    });
  }
  async work(
    id: number,
    owner?: string,
    business?: string,
    m?: EntityManager,
  ): Promise<EmailWork> {
    const rows = await this.query(
      'SELECT * FROM imported_documents WHERE id=?' +
        (owner ? ' AND firebase_id=? AND business_number=?' : '') +
        (m ? ' FOR UPDATE' : ''),
      owner ? [id, owner, business] : [id],
      m,
    );
    return rows[0];
  }
  async dueWork(): Promise<EmailWork[]> {
    if (!this.enabled()) return [];
    const scope = emailWorkScope(this.workerScope);
    return this.query(
      "SELECT * FROM imported_documents WHERE source='GMAIL' AND email_work_state IN ('MOVE_PENDING','READY','AI_PREPARED','AI_IN_FLIGHT','RESULT_SAVED','ROUTING_PENDING','MOVE_PROCESSED','DELETE_PENDING','DELETE_RETRY') AND (email_next_at IS NULL OR email_next_at<=UTC_TIMESTAMP(3)) AND (email_lease_token IS NULL OR email_lease_expires_at<UTC_TIMESTAMP(3)) " +
        scope.sql +
        ' ORDER BY id LIMIT 20',
      scope.params,
    );
  }
  async claimWork(work: EmailWork) {
    const scope = emailWorkScope(this.workerScope);
    const token = randomUUID();
    const r = await this.query(
      'UPDATE imported_documents SET email_lease_token=?,email_lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE) WHERE id=? AND firebase_id=? AND business_number=? AND email_work_state=? AND (email_lease_token IS NULL OR email_lease_expires_at<UTC_TIMESTAMP(3))' +
        scope.sql,
      [
        token,
        work.id,
        work.firebase_id,
        work.business_number,
        work.email_work_state,
        ...scope.params,
      ],
    );
    return r.affectedRows === 1 ? token : null;
  }
  async updateWork(
    work: EmailWork,
    token: string,
    changes: Record<string, any>,
  ) {
    const allowed = [
      'email_routing_json',
      'email_work_state',
      'email_ai_state',
      'email_ai_attempt_id',
      'email_result_json',
      'email_claim_id',
      'email_decision',
      'email_policy_version',
      'email_error_code',
      'email_next_at',
      'email_attempts',
      'email_deleted_at',
      'drive_file_id',
      'drive_file_name',
      'drive_folder_id',
      'email_lease_token',
      'email_lease_expires_at',
    ];
    if (Object.keys(changes).some((k) => !allowed.includes(k)))
      throw new Error('Invalid work field');
    const result = await this.query(
      'UPDATE imported_documents SET ' +
        Object.keys(changes)
          .map((k) => k + '=?')
          .join(',') +
        ' WHERE id=? AND firebase_id=? AND business_number=? AND email_lease_token=?',
      [
        ...Object.values(changes),
        work.id,
        work.firebase_id,
        work.business_number,
        token,
      ],
    );
    if (result.affectedRows !== 1)
      throw new ServiceUnavailableException('Gmail work lease changed');
    Object.assign(work, changes);
  }
  async managedFileIds(ids: string[]): Promise<Set<string>> {
    if (!this.enabled() || !ids.length) return new Set();
    const rows = await this.query(
      'SELECT drive_file_id FROM imported_documents WHERE drive_file_id IN (' +
        ids.map(() => '?').join(',') +
        ") AND email_work_state<>'LEGACY'",
      ids,
    );
    return new Set(rows.map((r) => r.drive_file_id));
  }
  async assertRetained(fileId: string, manager?: EntityManager) {
    if (!this.enabled() || !fileId) return;
    const rows = await this.query(
      'SELECT email_work_state,email_decision FROM imported_documents WHERE drive_file_id=? OR email_claim_id IN (SELECT id FROM extracted_document WHERE drive_file_id=?)' +
        (manager ? ' FOR UPDATE' : ''),
      [fileId, fileId],
      manager,
    );
    if (
      rows.some(
        (row) =>
          row.email_decision === 'NOT_ACCOUNTING' ||
          [
            'DELETE_PENDING',
            'DELETE_RETRY',
            'DELETE_UNCONFIRMED',
            'DELETED',
          ].includes(row.email_work_state),
      )
    )
      throw new ServiceUnavailableException(
        'Document is not available for accounting linkage',
      );
  }
  async decorateArchive(
    owner: string,
    business: string,
    items: any[],
    canManage: boolean,
  ) {
    if (!this.enabled()) return items;
    const work = await this.dispositions(owner, business);
    const hidden = new Set(
      work
        .filter(
          (row) =>
            row.email_decision === 'NOT_ACCOUNTING' ||
            row.email_work_state === 'DELETED',
        )
        .map((row) => row.drive_file_id)
        .filter(Boolean),
    );
    const hiddenClaims = new Set(
      work
        .filter(
          (row) =>
            row.email_decision === 'NOT_ACCOUNTING' ||
            row.email_work_state === 'DELETED',
        )
        .map((row) => row.email_claim_id)
        .filter(Boolean),
    );
    const result = items.filter(
      (item) =>
        !hidden.has(item.driveFileId) &&
        !(item.itemType === 'DOCUMENT' && hiddenClaims.has(item.id)),
    );
    for (const item of result) {
      const row=work.find(w=>w.drive_file_id===item.driveFileId && w.email_work_state==='WORK_BLOCKED');
      if(row) { item.canRetryProcessing=canManage; item.processingBlocked=true; }
    }
    for (const row of work) {
      if (
        ['PASSWORD_REQUIRED', 'REPLACED', 'DELETED'].includes(
          row.email_work_state,
        ) ||
        row.email_decision === 'NOT_ACCOUNTING' ||
        !row.drive_file_id ||
        result.some((item) => item.driveFileId === row.drive_file_id)
      )
        continue;
      result.push({
        id: -(2 ** 39 + row.id),
        itemType: 'DOCUMENT',
        documentType: null,
        documentKind: null,
        name: row.filename,
        documentDate: null,
        uploadDate: row.created_at,
        source: 'EMAIL',
        canRetryProcessing: canManage && row.email_work_state === 'WORK_BLOCKED',
        processingBlocked: row.email_work_state === 'WORK_BLOCKED',
        status: row.email_work_state === 'WORK_BLOCKED' || row.email_work_state.startsWith('BLOCKED_')
          ? 'ERROR'
          : 'PENDING',
        canResolve: false,
        canReclassify: false,
        canManageExpenses: canManage,
        driveFileId: row.drive_file_id,
        rejectionReason: null,
        vatReportPeriod: null,
        annualReportingYear: null,
      });
    }
    return result;
  }
  async dispositions(owner: string, business: string) {
    if (!this.enabled()) return [];
    return this.query(
      "SELECT * FROM imported_documents WHERE firebase_id=? AND business_number=? AND email_work_state<>'LEGACY'",
      [owner, business],
    );
  }
  async summary(run: EmailRun) {
    const parts = await this.query(
      "SELECT state,COUNT(*) AS count FROM email_import_items WHERE run_id=? AND part_path<>'@message' GROUP BY state",
      [run.id],
    );
    const messages = await this.query(
      "SELECT state,COUNT(*) AS count FROM email_import_items WHERE run_id=? AND part_path='@message' GROUP BY state",
      [run.id],
    );
    const work = await this.query(
      "SELECT d.email_work_state AS state,COUNT(DISTINCT d.id) AS count FROM imported_documents d LEFT JOIN email_import_items i ON i.imported_document_id=d.id WHERE (d.email_run_id=? OR i.run_id=?) AND d.email_work_state<>'REPLACED' GROUP BY d.email_work_state",
      [run.id, run.id],
    );
    return {
      messages: Object.fromEntries(
        messages.map((r) => [r.state, Number(r.count)]),
      ),
      attachments: Object.fromEntries(
        parts.map((r) => [r.state, Number(r.count)]),
      ),
      documents: Object.fromEntries(
        work.map((r) => [r.state, Number(r.count)]),
      ),
    };
  }
  async refreshRun(run: EmailRun) {
    const summary = await this.summary(run);
    const pending =
      (summary.messages.DISCOVERED || 0) +
      (summary.messages.RETRY || 0) +
      (summary.attachments.DISCOVERED || 0) +
      (summary.attachments.RETRY || 0);
    const blocked =
      (summary.messages.BLOCKED || 0) + (summary.attachments.BLOCKED || 0);
    const processing = Object.entries(summary.documents).some(
      ([state, count]) =>
        count > 0 &&
        ![
          'AWAITING_APPROVAL',
          'PASSWORD_REQUIRED',
          'DELETED',
          'DELETE_BLOCKED',
          'DELETE_UNCONFIRMED',
          'BLOCKED_INVALID',
          'BLOCKED_LIMIT',
          'WORK_BLOCKED',
          'LEGACY',
        ].includes(state),
    );
    const attention =
      blocked > 0 ||
      [
        'DELETE_BLOCKED',
        'DELETE_UNCONFIRMED',
        'BLOCKED_INVALID',
        'BLOCKED_LIMIT',
        'WORK_BLOCKED',
      ].some((state) => summary.documents[state] > 0);
    const current = (
      await this.query('SELECT scan_state FROM email_import_runs WHERE id=?', [
        run.id,
      ])
    )[0];
    const pull =
      current.scan_state === 'DONE' && !pending
        ? blocked
          ? 'PARTIAL'
          : 'COMPLETE'
        : 'RUNNING';
    await this.query(
      "UPDATE email_import_runs SET summary_json=?,pull_state=?,processing_state=?,pull_finished_at=IF(?='COMPLETE',COALESCE(pull_finished_at,UTC_TIMESTAMP(3)),pull_finished_at),processing_finished_at=IF(?='COMPLETE',COALESCE(processing_finished_at,UTC_TIMESTAMP(3)),NULL) WHERE id=?",
      [
        JSON.stringify(summary),
        pull,
        processing
          ? 'RUNNING'
          : attention
          ? 'ATTENTION'
          : pending
          ? 'WAITING'
          : 'COMPLETE',
        pull,
        processing
          ? 'RUNNING'
          : attention
          ? 'ATTENTION'
          : pending
          ? 'WAITING'
          : 'COMPLETE',
        run.id,
      ],
    );
    return { pull, summary };
  }
}
