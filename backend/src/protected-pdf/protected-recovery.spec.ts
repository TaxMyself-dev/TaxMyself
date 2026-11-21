import { createHash } from 'crypto';
import { ProtectedPdfWorker } from './protected-pdf.worker';

describe('abandoned protected upload recovery', () => {
  const bytes = Buffer.from('synthetic-open-pdf');
  const hash = createHash('sha256').update(bytes).digest('hex');
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.PROTECTED_PDF_DISPATCH_ENABLED;
    process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'true';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PROTECTED_PDF_DISPATCH_ENABLED;
    else process.env.PROTECTED_PDF_DISPATCH_ENABLED = saved;
  });
  function subject(version = 3) {
    const operation = {
      id: 'operation',
      protected_id: 7,
      firebase_id: 'owner',
      actor_id: 'actor',
      business_number: '123',
      expected_version: 3,
      content_hash: hash,
      candidate_drive_id: 'candidate',
      idempotency_key: 'stable-request-key',
      filename: 'open.pdf',
    };
    const store = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([operation])
        .mockResolvedValue({ affectedRows: 1 }),
      root: jest.fn().mockResolvedValue({ version }),
    };
    const service = {
      enabled: () => true,
      business: jest.fn().mockResolvedValue({ driveFolderId: 'business' }),
      replace: jest.fn(),
    };
    const drive = {
      ensureProtectedFolders: jest
        .fn()
        .mockResolvedValue({ staging: 'staging' }),
      findProtectedUploads: jest.fn().mockResolvedValue(['candidate']),
      downloadFile: jest.fn().mockResolvedValue(bytes),
    };
    return {
      service,
      store,
      drive,
      worker: new ProtectedPdfWorker(
        service as any,
        store as any,
        drive as any,
      ),
    };
  }
  it('recovers only the tagged candidate with matching bytes and current version', async () => {
    const t = subject();
    await t.worker.recoverAbandonedUploads();
    expect(t.service.replace).toHaveBeenCalledWith(
      'owner',
      'actor',
      '123',
      7,
      'stable-request-key',
      true,
      expect.objectContaining({ buffer: bytes }),
      3,
    );
    expect(t.store.query.mock.calls[1][0]).toContain('attempts<5');
  });
  it('does not revive a superseded reservation', async () => {
    const t = subject(4);
    await t.worker.recoverAbandonedUploads();
    expect(t.drive.downloadFile).not.toHaveBeenCalled();
    expect(t.service.replace).not.toHaveBeenCalled();
  });
  it('rejects untagged or modified candidates', async () => {
    const t = subject();
    t.drive.findProtectedUploads.mockResolvedValueOnce(['unrelated']);
    await t.worker.recoverAbandonedUploads();
    expect(t.drive.downloadFile).not.toHaveBeenCalled();
    const changed = subject();
    changed.drive.downloadFile.mockResolvedValue(Buffer.from('changed'));
    await changed.worker.recoverAbandonedUploads();
    expect(changed.service.replace).not.toHaveBeenCalled();
  });
  it('recovers eligible abandoned uploads without an activation variable', async () => {
    process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'false';
    const t = subject();
    await t.worker.recoverAbandonedUploads();
    expect(t.store.query).toHaveBeenCalled();
    expect(t.service.replace).toHaveBeenCalledTimes(1);
  });
});
