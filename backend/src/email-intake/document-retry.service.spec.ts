import { DocumentRetryService } from './document-retry.service';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
function fixture() {
  const work: any = {
    id: 1,
    firebase_id: 'owner',
    business_number: 'business',
    drive_file_id: 'file',
    content_hash: 'hash',
    email_run_id: 'run',
    email_work_state: 'WORK_BLOCKED',
    email_ai_state: 'NOT_SENT',
  };
  const jobs: any[] = [],
    claims: any[] = [];
  let held = false;
  const runners: any[] = [];
  const execute = jest.fn(async (sql: string, p: any[]) => {
    if (sql.includes('GET_LOCK')) {
      const acquired = held ? 0 : 1;
      held = true;
      return [{ acquired }];
    }
    if (sql.includes('RELEASE_LOCK')) {
      held = false;
      return [];
    }
    if (sql.includes('FROM imported_documents WHERE')) return [work];
    if (sql.startsWith('SELECT * FROM email_import_runs'))
      return [{ id: 'run', firebase_id: 'owner', worker_scope: 'local' }];
    if (sql.includes('FROM document_processing_jobs')) return jobs;
    if (sql.startsWith('SELECT e.*')) return claims;
    if (sql.startsWith('UPDATE imported_documents')) {
      work.email_work_state = sql.includes('email_work_state=?')
        ? p[0]
        : 'MOVE_PROCESSED';
      return { affectedRows: 1 };
    }
    if (sql.startsWith('UPDATE document_processing_jobs')) {
      jobs[0].state = p[0];
      return { affectedRows: 1 };
    }
    throw Error('Unexpected SQL ' + sql);
  });
  const db: any = {
    query: jest.fn(async (sql: string, p: any[]) => {
      if (sql.startsWith('SELECT * FROM business'))
        return p[0] === 'owner' && p[1] === 'business'
          ? [
              {
                drive_inbox_folder_id: 'inbox',
                drive_processed_folder_id: 'processed',
              },
            ]
          : [];
      if (sql.startsWith('SELECT * FROM email_import_runs'))
        return [{ id: 'run' }];
      if (sql.startsWith('SELECT id FROM user_integrations'))
        return p[0] === 17 && p[1] === 'owner' ? [{ id: 17 }] : [];
      if (sql.startsWith('SELECT DISTINCT'))
        return [{ id: 1, drive_file_id: 'file', business_number: 'business' }];
      throw Error('Unexpected SQL ' + sql);
    }),
    createQueryRunner: () => {
      const x: any = {
        isTransactionActive: false,
        connect: jest.fn(),
        query: execute,
        manager: { query: execute },
        startTransaction: jest.fn(async () => {
          x.isTransactionActive = true;
        }),
        commitTransaction: jest.fn(async () => {
          x.isTransactionActive = false;
        }),
        rollbackTransaction: jest.fn(async () => {
          x.isTransactionActive = false;
        }),
        release: jest.fn(),
      };
      runners.push(x);
      return x;
    },
  };
  const drive: any = {
    getIntakeFileMetadata: jest.fn(async () => ({
      parents: ['inbox'],
      md5Checksum: 'md5',
    })),
  };
  const store: any = { refreshRun: jest.fn() },
    routing: any = { assertImportedAllowed: jest.fn() };
  return {
    service: new DocumentRetryService(db, drive, store, routing),
    work,
    jobs,
    claims,
    db,
    drive,
    store,
    routing,
    execute,
    runners,
  };
}
describe('scoped and serialized retry requests', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = {
      ...original,
      ANTHROPIC_API_KEY: 'synthetic',
      DOCUMENT_AI_LIMIT_GROUP: 'test',
      DOCUMENT_AI_PROVIDER: 'anthropic',
      DOCUMENT_AI_MODEL: 'claude-test',
      DOCUMENT_AI_MAX_CONCURRENCY: '2',
      DOCUMENT_AI_RPM: '2',
      DOCUMENT_AI_ITPM: '1000',
      DOCUMENT_AI_OTPM: '1000',
      DOCUMENT_AI_PDF_PAGE_TOKENS: '20',
      DOCUMENT_AI_IMAGE_TOKENS: '20',
      DOCUMENT_AI_OUTPUT_ESTIMATE: '20',
    };
    delete process.env.EMAIL_WORKER_SCOPE;
  });
  afterEach(() => {
    process.env = original;
  });
  it('rejects missing capacity before any release', async () => {
    const f = fixture();
    delete process.env.DOCUMENT_AI_RPM;
    await expect(
      f.service.retryFiles('owner', 'business', ['file']),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(f.runners).toHaveLength(0);
  });
  it('checks business ownership', async () => {
    const f = fixture();
    await expect(
      f.service.retryFiles('other', 'business', ['file']),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.runners).toHaveLength(0);
  });
  it.each(
    [[], Array(101).fill('file'), ['invalid / id'], [7]].map((files) => ({
      files,
    })),
  )('validates bounded selections $files', async ({ files }) => {
    await expect(
      fixture().service.retryFiles('owner', 'business', files),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('deduplicates selections and repeated clicks', async () => {
    const f = fixture();
    expect(
      (await f.service.retryFiles('owner', 'business', ['file', 'file']))
        .retried,
    ).toBe(1);
    expect(
      f.execute.mock.calls.find(([sql]) =>
        sql.startsWith('UPDATE imported_documents'),
      )?.[1],
    ).toEqual(['READY', 1, 'owner', 'business']);
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).retried,
    ).toBe(0);
  });
  it('commits and refreshes run status', async () => {
    const f = fixture();
    await f.service.retryFiles('owner', 'business', ['file']);
    expect(f.runners[0].commitTransaction).toHaveBeenCalled();
    expect(f.store.refreshRun).toHaveBeenCalled();
    expect(f.runners[0].release).toHaveBeenCalled();
  });
  it('keeps uncertain attempts blocked without Drive calls or writes', async () => {
    const f = fixture();
    f.jobs.push({ state: 'UNKNOWN', drive_file_id: 'file' });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('UNKNOWN_OUTCOME');
    expect(f.drive.getIntakeFileMetadata).not.toHaveBeenCalled();
    expect(f.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
      false,
    );
    expect(f.runners[0].rollbackTransaction).toHaveBeenCalled();
  });
  it('does not mutate another file identity with matching content', async () => {
    const f = fixture();
    f.jobs.push({ state: 'BLOCKED', drive_file_id: 'other' });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('NOT_RETRYABLE');
  });
  it('rejects a Drive file outside the business', async () => {
    const f = fixture();
    f.drive.getIntakeFileMetadata.mockResolvedValue({ parents: ['foreign'] });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('FILE_UNAVAILABLE');
    expect(f.runners[0].commitTransaction).not.toHaveBeenCalled();
  });
  it('verifies checksum before adopting a saved extraction', async () => {
    const f = fixture();
    f.claims.push({
      id: 3,
      status: 'pending_review',
      raw_response: 'saved',
      drive_file_md5: 'different',
    });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('CONTENT_CHANGED');
  });
  it('adopts review output without modifying extracted fields or creating AI jobs', async () => {
    const f = fixture();
    f.claims.push({
      id: 3,
      status: 'pending_review',
      raw_response: 'saved',
      drive_file_md5: 'md5',
    });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('EXISTING_RESULT');
    expect(
      f.execute.mock.calls.some(
        ([sql]) =>
          sql.startsWith('INSERT') ||
          sql.startsWith('UPDATE extracted_document'),
      ),
    ).toBe(false);
  });
  it('resumes persistence with the same job and paid attempt', async () => {
    const f = fixture();
    f.jobs.push({
      id: 'job',
      purpose: 'GMAIL',
      context_json: { importId: 1 },
      provider: 'anthropic',
      model: 'claude-test',
      capacity_key: 'test',
      state: 'RESULT_SAVED',
      drive_file_id: 'file',
      attempt_id: 'paid',
      result_json: { invoices: [] },
    });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('RESUMED');
    expect(f.jobs[0].attempt_id).toBe('paid');
  });
  it('does not adopt another worker scope', async () => {
    process.env.EMAIL_WORKER_SCOPE = 'test';
    process.env.NODE_ENV = 'test';
    process.env.COMPOSIO_ENVIRONMENT = 'dev';
    const f = fixture();
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('OTHER_WORKER');
  });
  it('applies current sender rules before release', async () => {
    const f = fixture();
    f.routing.assertImportedAllowed.mockRejectedValue(Error('blocked'));
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('FAILED');
    expect(f.drive.getIntakeFileMetadata).not.toHaveBeenCalled();
  });
  it('serializes concurrent retries', async () => {
    const f = fixture();
    let resume: any;
    f.drive.getIntakeFileMetadata.mockImplementation(
      () =>
        new Promise((resolve) => {
          resume = resolve;
        }),
    );
    const first = f.service.retryFiles('owner', 'business', ['file']);
    while (!resume) await Promise.resolve();
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('BUSY');
    resume({ parents: ['inbox'] });
    expect((await first).retried).toBe(1);
    expect(
      f.execute.mock.calls.filter(([sql]) =>
        sql.startsWith('UPDATE imported_documents'),
      ),
    ).toHaveLength(1);
  });
  it('does not migrate a frozen quota/model during retry', async () => {
    const f = fixture();
    f.jobs.push({
      id: 'j',
      drive_file_id: 'file',
      state: 'BLOCKED',
      purpose: 'GMAIL',
      provider: 'anthropic',
      model: 'other-model',
      capacity_key: 'other',
    });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('CONFIGURATION_MISMATCH');
    expect(f.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
      false,
    );
  });
  it('does not cross from an imported file into another analysis purpose', async () => {
    const f = fixture();
    f.jobs.push({
      id: 'j',
      drive_file_id: 'file',
      state: 'BLOCKED',
      purpose: 'DOCUMENT',
      provider: 'anthropic',
      model: 'claude-test',
      capacity_key: 'test',
    });
    expect(
      (await f.service.retryFiles('owner', 'business', ['file'])).results[0]
        .status,
    ).toBe('NOT_RETRYABLE');
  });
  it('rolls back and releases the lock if a persistence update fails',async()=>{
    const f=fixture();const original=f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async(sql:string,p:any[])=>{if(sql.startsWith('UPDATE imported_documents'))throw Error('storage failure');return original(sql,p)});
    expect((await f.service.retryFiles('owner','business',['file'])).results[0].status).toBe('FAILED');
    expect(f.runners[0].rollbackTransaction).toHaveBeenCalled();expect(f.runners[0].commitTransaction).not.toHaveBeenCalled();expect(f.runners[0].release).toHaveBeenCalled();
  });
  it('scopes mailbox-wide retry to the owned account', async () => {
    const f = fixture();
    const batch = jest
      .spyOn(f.service as any, 'retryBatch')
      .mockResolvedValue({ results: [], retried: 0, skipped: 0 });
    await f.service.retryMailbox('owner', 17);
    expect(
      f.db.query.mock.calls.find(([sql]) =>
        sql.startsWith('SELECT DISTINCT'),
      )?.[1],
    ).toEqual(['owner', 17, 0]);
    expect(batch).toHaveBeenCalledWith('owner', [
      { fileId: 'file', business: 'business' },
    ]);
    await expect(f.service.retryMailbox('other', 17)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
