import { ProtectedPdfService } from './protected-pdf.service';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
const bytes = Buffer.from('%PDF-encrypted-synthetic');
describe('Durable locked-document intake (offline)', () => {
  const before = process.env.PROTECTED_PDF_ENABLED;
  beforeEach(() => (process.env.PROTECTED_PDF_ENABLED = 'true'));
  afterEach(() => {
    if (before === undefined) delete process.env.PROTECTED_PDF_ENABLED;
    else process.env.PROTECTED_PDF_ENABLED = before;
  });
  function subject() {
    const root: any = {
      id: 7,
      firebase_id: 'owner',
      business_number: '123',
      status: 'IMPORTING',
      original_import_id: null,
    };
    let record: any = null;
    const repo: any = {
      findOne: jest.fn(async () => record),
      create: (value: any) => ({ ...value }),
      save: jest.fn(async (value: any) => (record = { ...value, id: 41 })),
    };
    const manager = { getRepository: () => repo };
    const store: any = {
      root: jest.fn(async () => root),
      transaction: jest.fn(async (work: any) => {
        const old = { ...root },
          oldRecord = record;
        try {
          return await work(manager);
        } catch (error) {
          Object.keys(root).forEach((k) => delete root[k]);
          Object.assign(root, old);
          record = oldRecord;
          throw error;
        }
      }),
      query: jest.fn(async (sql: string, a: any[]) => {
        if (sql.startsWith('INSERT INTO protected_documents'))
          return { affectedRows: 1 };
        if (sql.startsWith('SELECT * FROM protected_documents')) return [root];
        if (sql.startsWith('UPDATE protected_documents SET lease_token=?')) {
          if (root.lease_token) return { affectedRows: 0 };
          root.lease_token = a[0];
          return { affectedRows: 1 };
        }
        if (
          sql.startsWith('UPDATE protected_documents SET original_import_id')
        ) {
          Object.assign(root, {
            original_import_id: a[0],
            original_drive_id: a[1],
          source: a[2],
            status: 'PASSWORD_REQUIRED',
            lease_token: null,
          });
          return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE protected_documents SET lease_token=NULL')) {
          root.lease_token = null;
          return { affectedRows: 1 };
        }
        throw new Error('Unexpected fake intake SQL');
      }),
    };
    const business = {
      firebaseId: 'owner',
      businessNumber: '123',
      driveFolderId: 'business',
      driveInboxFolderId: 'inbox',
      driveProcessedFolderId: 'processed',
    };
    let uploaded = false;
    const drive: any = {
      ensureProtectedFolders: jest
        .fn()
        .mockResolvedValue({ blocked: 'blocked', staging: 'staging' }),
      findProtectedUploads: jest.fn(async () => (uploaded ? ['original'] : [])),
      uploadProtectedFile: jest.fn(async () => {
        uploaded = true;
        return 'original';
      }),
      downloadFile: jest.fn().mockResolvedValue(bytes),
      getFolderParents: jest.fn().mockResolvedValue(['blocked']),
      moveFile: jest.fn(),
    };
    const service = new ProtectedPdfService(
      store,
      {
        inspect: jest.fn().mockResolvedValue({ kind: 'password_required' }),
      } as any,
      { findOne: jest.fn().mockResolvedValue(business) } as any,
      repo,
      { find: jest.fn().mockResolvedValue([]) } as any,
      drive,
    );
    const run = () =>
      service.storeLocked({
        firebaseId: 'owner',
        businessNumber: '123',
        filename: 'locked.pdf',
        content: bytes,
        source: DocumentImportSource.GMAIL,
        metadata: { integrationId: 17, gmailMessageId: 'message-1' },
      });
    return { root, repo, store, drive, run };
  }
  it('stores the original outside the OCR inbox and only then records password-required', async () => {
    const t = subject();
    const result = await t.run();
    expect(result.passwordRequired).toBe(true);
    expect(result.status).toBe('IMPORTED');
    expect(t.root.status).toBe('PASSWORD_REQUIRED');
    expect(t.repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        driveFolderId: 'blocked',
        source: 'GMAIL',
        gmailMessageId: 'message-1',
        firebaseId: 'owner',
        businessNumber: '123',
      }),
    );
    expect(t.drive.uploadProtectedFile).toHaveBeenCalledWith(
      'blocked',
      'locked.pdf',
      bytes,
      'root-7',
    );
    expect(t.drive.moveFile).not.toHaveBeenCalled();
  });
  it('does not duplicate the original on repeated intake', async () => {
    const t = subject();
    await t.run();
    const repeated = await t.run();
    expect(repeated.status).toBe('ALREADY_IMPORTED');
    expect(t.drive.uploadProtectedFile).toHaveBeenCalledTimes(1);
    expect(t.repo.save).toHaveBeenCalledTimes(1);
  });
  it('recovers its tagged original if upload succeeded but registration failed', async () => {
    const t = subject();
    t.repo.save.mockRejectedValueOnce(new Error('fake DB outage'));
    await expect(t.run()).rejects.toThrow('Locked document');
    expect(t.root.status).toBe('IMPORTING');
    expect(t.root.original_import_id).toBeNull();
    const result = await t.run();
    expect(result.passwordRequired).toBe(true);
    expect(t.drive.uploadProtectedFile).toHaveBeenCalledTimes(1);
    expect(t.drive.downloadFile).toHaveBeenCalledWith('original');
  });

  it('does not link a concurrently registered file before reconciling its real location', async () => {
    const t=subject();
    t.repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({id:99,firebaseId:'owner',businessNumber:'123',driveFileId:'other-winning-file',source:'GMAIL'});
    await expect(t.run()).rejects.toThrow('Concurrent intake');
    expect(t.root.status).toBe('IMPORTING');expect(t.root.original_import_id).toBeNull();
  });
  it('preserves the original intake source when adopting an existing owned file', async () => {
    const t=subject();
    t.repo.findOne.mockResolvedValue({id:41,firebaseId:'owner',businessNumber:'123',driveFileId:'original',driveFileName:'existing.pdf',source:'EMAIL_FORWARDING'});
    const result=await t.run();
    expect(result.status).toBe('ALREADY_IMPORTED');expect(t.root.source).toBe('EMAIL_FORWARDING');expect(t.drive.uploadProtectedFile).not.toHaveBeenCalled();
  });
});
