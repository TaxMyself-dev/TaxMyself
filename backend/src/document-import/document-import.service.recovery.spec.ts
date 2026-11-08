import { createHash } from 'crypto';
import { DocumentImportService } from './document-import.service';
import { DocumentImportSource } from './enums/document-import.enums';

describe('Drive upload recovery — in-memory Drive and SQL boundaries only', () => {
  const request = {
    firebaseId: 'owner',
    businessNumber: 'business',
    source: DocumentImportSource.API_IMPORT,
    filename: 'invoice.pdf',
    mimeType: 'application/pdf',
    content: Buffer.from('%PDF-test document bytes'),
  };
  let files: Map<string, any>,
    rows: any[],
    repo: any,
    business: any,
    drive: any;
  let sequence: number;
  const make = () =>
    new DocumentImportService(repo, business, drive, {} as any);
  const seed = (id: string, folderId = 'inbox', content = request.content) => {
    files.set(id, {
      id,
      folderId,
      name: 'original.pdf',
      content,
      createdTime: '2026-01-01T00:00:00Z',
    });
  };
  beforeEach(() => {
    files = new Map();
    rows = [];
    sequence = 0;
    repo = {
      findOne: jest.fn(
        async ({ where }) =>
          rows.find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) || null,
      ),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => {
        const row = { ...value, id: rows.length + 1 };
        rows.push(row);
        return row;
      }),
    };
    business = {
      findOne: jest.fn(async ({ where }) =>
        where.firebaseId === 'owner' && where.businessNumber === 'business'
          ? { driveInboxFolderId: 'inbox', driveProcessedFolderId: 'processed' }
          : null,
      ),
      save: jest.fn(),
    };
    drive = {
      listFolderFiles: jest.fn(async (folder) =>
        [...files.values()]
          .filter((f) => f.folderId === folder)
          .map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: 'application/pdf',
            size: f.content.length,
            createdTime: f.createdTime,
            md5Checksum: createHash('md5').update(f.content).digest('hex'),
          })),
      ),
      downloadFile: jest.fn(async (id) => Buffer.from(files.get(id).content)),
      uploadFile: jest.fn(async (folderId, name, content) => {
        const id = 'new-' + ++sequence;
        files.set(id, {
          id,
          folderId,
          name,
          content: Buffer.from(content),
          createdTime: '2026-02-01T00:00:00Z',
        });
        return id;
      }),
      deleteFile: jest.fn(async (id) => {
        files.delete(id);
      }),
    };
  });
  it('recovers after a simulated process interruption between upload and DB save without another upload', async () => {
    let reachedSave!: () => void;
    const atSave = new Promise<void>((resolve) => {
      reachedSave = resolve;
    });
    repo.save.mockImplementationOnce(() => {
      reachedSave();
      // Abandon this execution like a killed process: no real timer/IO or cleanup.
      return new Promise(() => {});
    });
    void make().importDocument(request);
    await atSave;
    expect(files.size).toBe(1);
    expect(rows).toHaveLength(0);
    const result = await make().importDocument(request);
    expect(result).toMatchObject({ status: 'IMPORTED', driveFileId: 'new-1' });
    expect(rows).toHaveLength(1);
    expect(files.size).toBe(1);
    expect(drive.uploadFile).toHaveBeenCalledTimes(1);
    expect(drive.downloadFile).toHaveBeenCalledWith('new-1');
    const listings = drive.listFolderFiles.mock.calls.length;
    expect((await make().importDocument(request)).status).toBe(
      'ALREADY_IMPORTED',
    );
    expect(drive.listFolderFiles).toHaveBeenCalledTimes(listings);
  });
  it('recovers the same content already moved to this business processed folder', async () => {
    seed('existing', 'processed');
    const result = await make().importDocument(request);
    expect(result.driveFileId).toBe('existing');
    expect(rows[0]).toMatchObject({
      driveFolderId: 'processed',
      driveFileName: 'original.pdf',
    });
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });
  it('checks SHA-256 of downloaded bytes rather than trusting matching MD5 metadata', async () => {
    seed('wrong', 'inbox', Buffer.from('not the same bytes'));
    const metadata = {
      id: 'wrong',
      name: 'original.pdf',
      size: request.content.length,
      md5Checksum: createHash('md5').update(request.content).digest('hex'),
    };
    drive.listFolderFiles.mockImplementation(async (folder) =>
      folder === 'inbox' ? [metadata] : [],
    );
    const result = await make().importDocument(request);
    expect(result.driveFileId).toBe('new-1');
    expect(files.has('wrong')).toBe(true);
    expect(drive.uploadFile).toHaveBeenCalledTimes(1);
  });
  it('preserves a recovered file after registration failure, then registers it on retry', async () => {
    seed('existing');
    repo.save.mockRejectedValueOnce(new Error('fake DB outage'));
    expect((await make().importDocument(request)).status).toBe('SKIPPED');
    expect(drive.deleteFile).not.toHaveBeenCalled();
    expect(files.has('existing')).toBe(true);
    expect((await make().importDocument(request)).status).toBe('IMPORTED');
    expect(drive.uploadFile).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });
  it('preserves the recovered file when a concurrent importer wins the ledger race', async () => {
    seed('existing');
    repo.save.mockImplementationOnce(async (value) => {
      rows.push({ ...value, id: 55 });
      throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    });
    const result = await make().importDocument(request);
    expect(result).toMatchObject({
      status: 'ALREADY_IMPORTED',
      driveFileId: 'existing',
      importedDocumentId: 55,
    });
    expect(drive.deleteFile).not.toHaveBeenCalled();
    expect(files.has('existing')).toBe(true);
  });
  it('keeps existing compensation for a newly uploaded file when DB registration fails', async () => {
    repo.save.mockRejectedValueOnce(new Error('fake DB outage'));
    expect((await make().importDocument(request)).status).toBe('SKIPPED');
    expect(drive.deleteFile).toHaveBeenCalledWith('new-1');
    expect(files.size).toBe(0);
  });
  it('recovers after failed compensation left an unregistered upload behind', async () => {
    repo.save.mockRejectedValueOnce(new Error('fake DB outage'));
    drive.deleteFile.mockRejectedValueOnce(new Error('fake delete outage'));
    expect((await make().importDocument(request)).status).toBe('SKIPPED');
    expect(files.size).toBe(1);
    expect(rows).toHaveLength(0);
    expect((await make().importDocument(request)).driveFileId).toBe('new-1');
    expect(drive.uploadFile).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(files.size).toBe(1);
  });
  it('selects one deterministic existing copy without deleting any pre-existing duplicates', async () => {
    seed('old-b');
    seed('old-a');
    expect((await make().importDocument(request)).driveFileId).toBe('old-a');
    expect(drive.uploadFile).not.toHaveBeenCalled();
    expect(drive.deleteFile).not.toHaveBeenCalled();
    expect(files.size).toBe(2);
  });
  it('does not adopt content from another business folder or list folders for a non-owner', async () => {
    seed('other-business', 'other-inbox');
    expect((await make().importDocument(request)).driveFileId).toBe('new-1');
    expect(drive.downloadFile).not.toHaveBeenCalled();
    drive.listFolderFiles.mockClear();
    await expect(
      make().importDocument({ ...request, firebaseId: 'stranger' }),
    ).rejects.toThrow();
    expect(drive.listFolderFiles).not.toHaveBeenCalled();
  });
  it('fails closed on a recovery download error instead of creating a duplicate', async () => {
    seed('existing');
    drive.downloadFile.mockRejectedValueOnce(new Error('fake Drive outage'));
    expect((await make().importDocument(request)).status).toBe('SKIPPED');
    expect(drive.uploadFile).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
