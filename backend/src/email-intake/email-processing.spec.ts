import { createHash } from 'crypto';
import { EmailProcessingWorker } from './email-processing.worker';
import { EmailIntakeStore } from './email-intake.store';
import { GMAIL_POLICY_VERSION } from '../documents/gmail-document-policy';
const original = { ...process.env };
beforeEach(() => {
  process.env.GMAIL_DURABLE_PROCESS_ENABLED = 'true';
  process.env.GMAIL_DURABLE_DELETE_ENABLED = 'true';
});
afterEach(() => {
  for (const key of [
    'GMAIL_DURABLE_PROCESS_ENABLED',
    'GMAIL_DURABLE_DELETE_ENABLED',
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
function subject(state = 'READY') {
  const work: any = {
    id: 200,
    content_hash: createHash('sha256').update('synthetic-bytes').digest('hex'),
    source: 'GMAIL',
    firebase_id: 'owner',
    business_number: '123',
    drive_file_id: 'candidate',
    drive_folder_id: 'inbox',
    filename: 'file.pdf',
    email_work_state: state,
    email_ai_state: 'NOT_SENT',
    email_claim_id: 9,
    email_upload_tag: 'upload-tag',
    email_policy_version: GMAIL_POLICY_VERSION,
    email_attempts: 0,
  };
  let parent = 'inbox';
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('GET_LOCK')) return [{ acquired: 1 }];
    if (sql.startsWith('SELECT')) return [];
    return { affectedRows: 1 };
  });
  const store: any = {
    enabled: () => true,
    db: {
      createQueryRunner: () => ({
        connect: async () => {},
        query,
        release: async () => {},
      }),
    },
    claimWork: jest.fn(async () => 'token'),
    updateWork: jest.fn(async (_w: any, _t: string, patch: any) =>
      Object.assign(work, patch),
    ),
    query,
    transaction: async (fn: any) => fn({}),
    work: async () => ({ ...work, email_lease_token: 'token' }),
  };
  const documents: any = {
    queueEmailWork:jest.fn(async()=>{work.email_work_state='AI_QUEUED';}),
    prepareEmailWork: jest.fn().mockResolvedValue({}),
    extractEmailWork: jest.fn().mockResolvedValue({
      intakeDecision: 'accounting',
      invoices: [{ document_type: 'receipt' }],
    }),
    persistEmailWork: jest.fn(async (_w: any, _t: string, result: any) => {
      work.email_decision =
        result.intakeDecision === 'not_accounting'
          ? 'NOT_ACCOUNTING'
          : result.intakeDecision === 'accounting'
            ? 'ACCOUNTING'
            : 'UNCERTAIN';
      work.email_work_state =
        result.intakeDecision === 'not_accounting'
          ? 'DELETE_PENDING'
          : 'MOVE_PROCESSED';
    }),
  };
  const drive: any = {
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('synthetic-bytes')),
    getIntakeFileMetadata: jest.fn(async () => ({
      parents: [parent],
      appProperties: { keepintaxProtectedOperation: 'upload-tag' },
    })),
    moveFile: jest.fn(async (_id: string, _from: string, to: string) => {
      parent = to;
    }),
    deleteIntakeFile: jest.fn().mockResolvedValue('DELETED'),
  };
  const business: any = {
    firebaseId: 'owner',
    businessNumber: '123',
    driveInboxFolderId: 'inbox',
    driveProcessedFolderId: 'processed',
  };
  return {
    work,
    store,
    documents,
    drive,
    business,
    worker: new EmailProcessingWorker(store, documents, drive, {
      findOneBy: async () => business,
    } as any),
  };
}
describe('durable single-pass work and safe deletion (mocks only)', () => {
  it('hands this file to shared admission without executing AI or moving it prematurely',async()=>{const t=subject();await t.worker.runOne(t.work);expect(t.documents.queueEmailWork).toHaveBeenCalledWith(t.work,'token');expect(t.work.email_work_state).toBe('AI_QUEUED');expect(t.documents.extractEmailWork).not.toHaveBeenCalled();expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();expect(t.drive.moveFile).not.toHaveBeenCalled();});
  it('resumes a saved response without another AI call', async () => {
    const t = subject('RESULT_SAVED');
    t.work.email_result_json = {
      intakeDecision: 'accounting',
      invoices: [{ document_type: 'insurance_policy' }],
    };
    await t.worker.runOne(t.work);
    expect(t.documents.extractEmailWork).not.toHaveBeenCalled();
    expect(t.work.email_work_state).toBe('AWAITING_APPROVAL');
  });
  it('retains an unknown in-flight result for ordinary approval without replay or deletion', async () => {
    const t = subject('AI_IN_FLIGHT');
    await t.worker.runOne(t.work);
    expect(t.documents.extractEmailWork).not.toHaveBeenCalled();
    expect(t.documents.persistEmailWork).toHaveBeenCalledWith(
      t.work,
      'token',
      expect.objectContaining({
        intakeDecision: 'uncertain',
        technicalCode: 'AI_UNKNOWN_OUTCOME',
      }),
    );
    expect(t.work.email_work_state).toBe('AWAITING_APPROVAL');
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('retains a failed queue handoff without making a provider request',async()=>{const t=subject();t.documents.queueEmailWork.mockRejectedValue(new Error('storage unavailable'));await t.worker.runOne(t.work);expect(t.documents.extractEmailWork).not.toHaveBeenCalled();expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();expect(t.work.email_work_state).not.toBe('DELETED');});
  it.each([
    { intakeDecision: 'uncertain', invoices: [] },
    { invoices: [] },
    { intakeDecision: 'not_accounting', invoices: [{}] },
  ])(
    'does not delete an empty, unresolved or contradictory response',
    async (result) => {
      const t = subject('DELETE_PENDING');
      t.work.email_decision = 'NOT_ACCOUNTING';
      t.work.email_ai_state = 'RESULT_SAVED';
      t.work.email_result_json = result;
      await expect(
        t.worker.deleteOne(t.work, 'token', t.business),
      ).rejects.toThrow();
      expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
    },
  );
  it('blocks referenced files', async () => {
    const t = subject('DELETE_PENDING');
    Object.assign(t.work, {
      email_decision: 'NOT_ACCOUNTING',
      email_ai_state: 'RESULT_SAVED',
      email_result_json: {
        intakeDecision: 'not_accounting',
        invoices: [],
        rawResponse: '{"decision":"not_accounting","invoices":[]}',
      },
    });
    t.store.query.mockResolvedValueOnce([{ reason: 'expense' }]);
    await t.worker.deleteOne(t.work, 'token', t.business);
    expect(t.work.email_work_state).toBe('DELETE_BLOCKED');
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('does not claim an ambiguous 404 as successful deletion', async () => {
    const t = subject('DELETE_PENDING');
    Object.assign(t.work, {
      email_decision: 'NOT_ACCOUNTING',
      email_ai_state: 'RESULT_SAVED',
      email_result_json: {
        intakeDecision: 'not_accounting',
        invoices: [],
        rawResponse: '{"decision":"not_accounting","invoices":[]}',
      },
    });
    t.drive.deleteIntakeFile.mockResolvedValue('UNCONFIRMED');
    await t.worker.deleteOne(t.work, 'token', t.business);
    expect(t.work.email_work_state).toBe('DELETE_UNCONFIRMED');
    expect(t.work.email_deleted_at).toBeUndefined();
  });
  it('makes the durable store and processing worker available without activation variables', () => {
    const store=new EmailIntakeStore({} as any);
    expect(store.enabled()).toBe(true);
    expect(new EmailProcessingWorker(store,{} as any,{} as any,{} as any).enabled()).toBe(true);
  });
  it('records confirmed deletion only after Drive acknowledgement and DB finalization', async () => {
    const t = subject('DELETE_PENDING');
    Object.assign(t.work, {
      email_decision: 'NOT_ACCOUNTING',
      email_ai_state: 'RESULT_SAVED',
      email_result_json: {
        intakeDecision: 'not_accounting',
        invoices: [],
        rawResponse: '{"decision":"not_accounting","invoices":[]}',
      },
    });
    await t.worker.deleteOne(t.work, 'token', t.business);
    expect(t.drive.deleteIntakeFile).toHaveBeenCalledTimes(1);
    expect(t.work.email_work_state).toBe('DELETED');
    expect(
      t.store.query.mock.calls.some((call) =>
        call[0].includes("email_work_state='DELETED'"),
      ),
    ).toBe(true);
  });
  it('does not report deletion when the post-delete database finalization failed', async () => {
    const t = subject('DELETE_PENDING');
    Object.assign(t.work, {
      email_decision: 'NOT_ACCOUNTING',
      email_ai_state: 'RESULT_SAVED',
      email_result_json: {
        intakeDecision: 'not_accounting',
        invoices: [],
        rawResponse: '{"decision":"not_accounting","invoices":[]}',
      },
    });
    t.store.transaction = async () => {
      throw new Error('DB unavailable');
    };
    await t.worker.deleteOne(t.work, 'token', t.business);
    expect(t.work.email_work_state).toBe('DELETE_RETRY');
    expect(t.drive.deleteIntakeFile).toHaveBeenCalledTimes(1);
  });
  it('queues an owned file already in processed for shared-result adoption',async()=>{const t=subject();t.drive.getIntakeFileMetadata.mockResolvedValue({parents:['processed']});await t.worker.runOne(t.work);expect(t.documents.queueEmailWork).toHaveBeenCalledWith(t.work,'token');expect(t.documents.extractEmailWork).not.toHaveBeenCalled();expect(t.work.email_work_state).toBe('AI_QUEUED');});
  it('blocks deletion if the file content changed after the negative AI decision', async () => {
    const t = subject('DELETE_PENDING');
    Object.assign(t.work, {
      email_decision: 'NOT_ACCOUNTING',
      email_ai_state: 'RESULT_SAVED',
      email_result_json: {
        intakeDecision: 'not_accounting',
        invoices: [],
        rawResponse: '{"decision":"not_accounting","invoices":[]}',
      },
    });
    t.drive.downloadFile.mockResolvedValue(
      Buffer.from('different synthetic content'),
    );
    await t.worker.deleteOne(t.work, 'token', t.business);
    expect(t.work.email_work_state).toBe('DELETE_BLOCKED');
    expect(t.work.email_error_code).toBe('CONTENT_CHANGED');
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
});
