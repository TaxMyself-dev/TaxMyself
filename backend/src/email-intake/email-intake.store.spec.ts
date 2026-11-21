import { EmailIntakeStore } from './email-intake.store';
import { EmailIntakeStorage } from './email-intake.storage';
describe('durable intake persistence boundaries (offline)', () => {
  const old = process.env.GMAIL_DURABLE_INTAKE_ENABLED;
  beforeEach(() => {
    process.env.GMAIL_DURABLE_INTAKE_ENABLED = 'true';
  });
  afterEach(() => {
    if (old === undefined) delete process.env.GMAIL_DURABLE_INTAKE_ENABLED;
    else process.env.GMAIL_DURABLE_INTAKE_ENABLED = old;
  });
  it('rejects stale run leases before committing a page or item', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ lease_token: 'new-token' }]),
    };
    const db: any = { transaction: (fn: any) => fn(manager) };
    const store = new EmailIntakeStore(db);
    const run: any = {
      id: 'run',
      firebase_id: 'owner',
      business_number: '123',
    };
    await expect(
      store.savePage(run, 'stale-token', ['mail1'], 'next'),
    ).rejects.toThrow('lease');
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it('keeps a deletion tombstone deduplicated without uploading anything', async () => {
    const store: any = {
      enabled: () => true,
      work: jest
        .fn()
        .mockResolvedValue({ id: 99, email_work_state: 'DELETED' }),
    };
    const business: any = {
      firebaseId: 'owner',
      businessNumber: '123',
      driveFolderId: 'root',
      driveInboxFolderId: 'inbox',
    };
    const drive: any = {
      uploadProtectedFile: jest.fn(),
      ensureIntakeStaging: jest.fn(),
    };
    const storage = new EmailIntakeStorage(
      store,
      { findOneBy: async () => business } as any,
      { findOneBy: async () => ({ id: 99 }) } as any,
      drive,
      {} as any,
      {} as any,
    );
    expect(
      await storage.accept(
        { firebase_id: 'owner', business_number: '123' } as any,
        { filename: 'copy.pdf', mime_type: 'application/pdf' } as any,
        Buffer.from('synthetic'),
      ),
    ).toEqual({ id: 99, duplicate: true });
    expect(drive.uploadProtectedFile).not.toHaveBeenCalled();
    expect(drive.ensureIntakeStaging).not.toHaveBeenCalled();
  });
  it('does not attach an unrelated file when content changed under an operation tag', async () => {
    const work: any = {
      id: 99,
      firebase_id: 'owner',
      business_number: '123',
      email_work_state: 'STAGING',
      email_upload_tag: 'tag',
    };
    const store: any = {
      enabled: () => true,
      query: jest.fn(async (sql: string) =>
        sql.startsWith('SELECT') ? [work] : { affectedRows: 1 },
      ),
      claimWork: async () => 'token',
    };
    const drive: any = {
      ensureIntakeStaging: async () => 'staging',
      findProtectedUploads: async () => ['other-file'],
      downloadFile: async () => Buffer.from('different'),
      uploadProtectedFile: jest.fn(),
    };
    const storage = new EmailIntakeStorage(
      store,
      {
        findOneBy: async () => ({
          firebaseId: 'owner',
          businessNumber: '123',
          driveFolderId: 'root',
          driveInboxFolderId: 'inbox',
        }),
      } as any,
      { findOneBy: async () => null } as any,
      drive,
      {} as any,
      { inspect: async () => ({ kind: 'readable' }) } as any,
    );
    await expect(
      storage.accept(
        { firebase_id: 'owner', business_number: '123' } as any,
        { filename: 'copy.pdf', mime_type: 'application/pdf' } as any,
        Buffer.from('original'),
      ),
    ).rejects.toThrow('identity');
    expect(drive.uploadProtectedFile).not.toHaveBeenCalled();
  });
  it('denies approval/linkage to content pending deletion within the caller transaction', async () => {
    const manager: any = {
      query: jest.fn().mockResolvedValue([
        {
          email_work_state: 'DELETE_PENDING',
          email_decision: 'NOT_ACCOUNTING',
        },
      ]),
    };
    const store = new EmailIntakeStore({} as any);
    await expect(store.assertRetained('candidate', manager)).rejects.toThrow(
      'linkage',
    );
    expect(manager.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it('hides a confirmed negative even after a protected/archive projection supplied it', async () => {
    const store = new EmailIntakeStore({} as any);
    jest.spyOn(store, 'dispositions').mockResolvedValue([
      {
        id: 99,
        email_work_state: 'DELETED',
        email_decision: 'NOT_ACCOUNTING',
        drive_file_id: null,
        email_claim_id: 7,
      },
    ] as any);
    const result = await store.decorateArchive(
      'owner',
      '123',
      [
        {
          id: 7,
          itemType: 'DOCUMENT',
          driveFileId: 'deleted-file',
          status: 'DELETED',
        },
      ],
      true,
    );
    expect(result).toEqual([]);
  });
  it('detects a persisted cursor cycle before committing another page', async () => {
    const manager: any = {
      query: jest
        .fn()
        .mockResolvedValue([
          { lease_token: 'token', page_history_json: '["again"]' },
        ]),
    };
    const store = new EmailIntakeStore({
      transaction: (fn: any) => fn(manager),
    } as any);
    await expect(
      store.savePage(
        { id: 'run', firebase_id: 'owner', business_number: '123' } as any,
        'token',
        ['message'],
        'again',
      ),
    ).rejects.toThrow();
    expect(manager.query).toHaveBeenCalledTimes(1);
  });
  it('does not hide an unrelated expense whose numeric ID equals a removed document ID', async () => {
    const store = new EmailIntakeStore({} as any);
    jest.spyOn(store, 'dispositions').mockResolvedValue([
      {
        id: 200,
        email_work_state: 'DELETED',
        email_decision: 'NOT_ACCOUNTING',
        drive_file_id: null,
        email_claim_id: 7,
      },
    ] as any);
    const expense = {
      id: 7,
      itemType: 'EXPENSE',
      driveFileId: null,
      status: 'APPROVED',
    };
    expect(
      await store.decorateArchive('owner', '123', [expense], true),
    ).toEqual([expense]);
  });
  it('keeps a failed staged upload linked and blocks it after the bounded retry budget', async () => {
    const manager: any = {
      query: jest.fn(async (sql: string) =>
        sql.startsWith('SELECT')
          ? [{ lease_token: 'token' }]
          : { affectedRows: 1 },
      ),
    };
    const store = new EmailIntakeStore({
      transaction: (fn: any) => fn(manager),
    } as any);
    await store.retryItem(
      { id: 'run', firebase_id: 'owner', business_number: '123' } as any,
      'token',
      { id: 'part' } as any,
      'ATTACHMENT_RETRY',
      99,
    );
    const calls = manager.query.mock.calls;
    expect(calls[1][1]).toEqual([99, 'part', 'run']);
    expect(calls[2][0]).toContain("email_work_state='WORK_BLOCKED'");
    expect(calls[2][1]).toEqual([99, 'owner', '123', 'part', 'run']);
    expect(calls[2][0]).toContain('attempts>=4');
  });
});
