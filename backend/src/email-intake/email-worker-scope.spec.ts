import { EmailIntakeStore } from './email-intake.store';
import { DocumentAiStore } from '../document-ai/document-ai.store';
import { ProtectedPdfWorker } from '../protected-pdf/protected-pdf.worker';
import { GmailSyncCronService } from '../integrations/services/gmail-sync-cron.service';
import {
  emailWorkerScope,
  emailRunScope,
  emailWorkScope,
  emailAnalysisScope,
  emailProtectedRootScope,
  emailProtectedOperationScope,
} from './email-worker-scope';

describe('server-owned email worker routing', () => {
  const keys = ['EMAIL_WORKER_SCOPE', 'NODE_ENV', 'COMPOSIO_ENVIRONMENT'];
  let saved: Array<string | undefined>;
  beforeEach(() => {
    saved = keys.map((k) => process.env[k]);
    Object.assign(process.env, {
      EMAIL_WORKER_SCOPE: 'local',
      NODE_ENV: 'development',
      COMPOSIO_ENVIRONMENT: 'dev',
    });
  });
  afterEach(() =>
    keys.forEach((k, i) =>
      saved[i] === undefined
        ? delete process.env[k]
        : (process.env[k] = saved[i]),
    ),
  );
  const input = {
    owner: 'owner',
    business: 'business',
    integrationId: 19,
    query: 'frozen dates',
    type: 'MANUAL',
  };
  function subject(active: any[] = []) {
    const query = jest.fn(async (sql: string) =>
      sql.includes('FROM user_integrations')
        ? [{ id: 19, status: 'ACTIVE' }]
        : sql.startsWith('SELECT id')
        ? active
        : sql.startsWith('INSERT')
        ? { affectedRows: 1 }
        : [],
    );
    const db: any = { query, transaction: async (fn: any) => fn({ query }) };
    return { store: new EmailIntakeStore(db), query };
  }
  it('validates exact scope values and refuses accidental production activation', () => {
    expect(emailWorkerScope({})).toBeNull();
    expect(emailWorkerScope({ NODE_ENV: 'production' })).toBeNull();
    expect(emailWorkerScope(process.env)).toBe('local');
    expect(() =>
      emailWorkerScope({
        EMAIL_WORKER_SCOPE: 'test',
        NODE_ENV: 'production',
        COMPOSIO_ENVIRONMENT: 'dev',
      }),
    ).toThrow('production');
    expect(() =>
      emailWorkerScope({
        EMAIL_WORKER_SCOPE: 'local',
        COMPOSIO_ENVIRONMENT: 'prod',
      }),
    ).toThrow('DEV');
    expect(() =>
      emailWorkerScope({
        EMAIL_WORKER_SCOPE: 'other',
        COMPOSIO_ENVIRONMENT: 'dev',
      }),
    ).toThrow('local or test');
  });
  it('has no new-column/schema dependency when unset in production', async () => {
    delete process.env.EMAIL_WORKER_SCOPE;
    process.env.NODE_ENV = 'production';
    const t = subject();
    await t.store.onModuleInit();
    expect(t.query).not.toHaveBeenCalled();
    await t.store.createRun(input);
    await t.store.runs();
    await t.store.runs('owner');
    await t.store.leaseRun('run');
    await t.store.dueWork();
    await t.store.claimWork({ id: 1 } as any);
    expect(JSON.stringify(t.query.mock.calls)).not.toContain('worker_scope');
    for (const helper of [
      emailRunScope,
      emailWorkScope,
      emailAnalysisScope,
      emailProtectedRootScope,
      emailProtectedOperationScope,
    ])
      expect(helper(null)).toEqual({ sql: '', params: [] });
  });
  it.each(['local', 'test'])(
    'tags new runs from the %s server, ignoring request-supplied tags',
    async (scope) => {
      process.env.EMAIL_WORKER_SCOPE = scope;
      const t = subject();
      await t.store.createRun({ ...input, worker_scope: 'spoofed' } as any);
      const call = t.query.mock.calls.find(([sql]) =>
        sql.startsWith('INSERT'),
      ) as any;
      expect(call[0]).toContain('to_date,worker_scope');
      expect(call[1].at(-1)).toBe(scope);
      expect(call[1]).not.toContain('spoofed');
    },
  );
  it('never reuses another scope or historical unscoped active run', async () => {
    for (const worker_scope of ['test', null]) {
      const t = subject([{ id: 'foreign-run', worker_scope }]);
      await expect(t.store.createRun(input)).rejects.toThrow('another worker');
      expect(t.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
        false,
      );
    }
    const own = subject([{ id: 'local-run', worker_scope: 'local' }]);
    expect(await own.store.createRun(input)).toBe('local-run');
  });
  it('filters listing and lease acquisition, including direct ID claims', async () => {
    const t = subject();
    await t.store.runs();
    await t.store.runs('owner');
    await t.store.leaseRun('foreign');
    for (const [sql, args] of t.query.mock.calls as any) {
      expect(sql).toContain('worker_scope=?');
      expect(args.at(-1)).toBe('local');
      expect(sql).not.toContain('OR worker_scope IS NULL');
    }
  });
  it('filters downstream work both before selection and at lease acquisition', async () => {
    const t = subject();
    await t.store.dueWork();
    await t.store.claimWork({ id: 1 } as any);
    for (const [sql, args] of t.query.mock.calls as any) {
      expect(sql).toContain('scope_run.worker_scope=?');
      expect(sql).toContain(
        'scope_run.firebase_id=imported_documents.firebase_id',
      );
      expect(args.at(-1)).toBe('local');
    }
  });
  it('rejects wrong live database or missing schema before starting a scoped server', async () => {
    const wrong = new EmailIntakeStore({
      query: async () => [{ db: 'other' }],
    } as any);
    await expect(wrong.onModuleInit()).rejects.toThrow('keepintax-dev');
    let calls = 0;
    const missing = new EmailIntakeStore({
      query: async () => (++calls === 1 ? [{ db: 'keepintax-dev' }] : []),
    } as any);
    await expect(missing.onModuleInit()).rejects.toThrow('reviewed');
  });
  it('routes email AI upload recovery, terminal reporting and stale-lease recovery', async () => {
    const query = jest.fn(async () => []);
    const store = new DocumentAiStore({ query } as any);
    await store.unfinishedUploads();
    await store.recoverExpired();
    await store.unreportedGmailFailures();
    const calls = query.mock.calls as any[];
    const emailCalls = calls.filter(
      ([sql]) => !sql.includes("WHERE purpose='FORM_FILL'"),
    );
    for (const [sql, args] of emailCalls) {
      expect(sql).toContain('scope_run.worker_scope=?');
      expect(sql).toContain("purpose<>'GMAIL'");
      expect(args.at(-1)).toBe('local');
    }
  });
  it('keeps the production AI recovery and protected worker SQL free of scope references', async () => {
    delete process.env.EMAIL_WORKER_SCOPE;
    process.env.NODE_ENV = 'production';
    const query = jest.fn(async () => []);
    const store = new DocumentAiStore({ query } as any);
    await store.unfinishedUploads();
    await store.recoverExpired();
    await store.unreportedGmailFailures();
    const worker = new ProtectedPdfWorker(
      { enabled: () => true } as any,
      { query } as any,
      {} as any,
    );
    await worker.tick();
    expect(JSON.stringify(query.mock.calls)).not.toContain('worker_scope');
  });
  it('blocks direct protected-file delivery from another email scope before external effects', async () => {
    const op = {
      id: 'op',
      protected_id: 1,
      firebase_id: 'owner',
      business_number: 'business',
      status: 'PENDING',
    };
    const query = jest.fn(async () => []);
    const store: any = {
      query,
      operation: async () => op,
      root: async () => ({}),
      transaction: async (fn: any) => fn({}),
    };
    const business = jest.fn();
    const drive = { moveFile: jest.fn() };
    await new ProtectedPdfWorker(
      { enabled: () => true, business } as any,
      store,
      drive as any,
    ).deliver('op');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('scope_run.worker_scope=?'),
      ['op', 'local'],
      {},
    );
    expect(business).not.toHaveBeenCalled();
    expect(drive.moveFile).not.toHaveBeenCalled();
  });
  it('creates nightly tasks only on test when routing is enabled', async () => {
    const candidates = jest.fn(async () => []);
    const cron = new GmailSyncCronService(
      { findGmailSyncCandidates: candidates } as any,
      {} as any,
    );
    await cron.processEligibleSyncs();
    expect(candidates).not.toHaveBeenCalled();
    process.env.EMAIL_WORKER_SCOPE = 'test';
    await cron.processEligibleSyncs();
    expect(candidates).toHaveBeenCalledTimes(1);
  });
});
