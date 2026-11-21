import { createHash } from 'crypto';
import { DocumentsService } from '../documents/documents.service';
function setup(status = 'pending_review') {
  const bytes = Buffer.from('synthetic');
  const row: any = {
    id: 9,
    userId: 7,
    businessNumber: '123',
    driveFileId: 'file',
    status,
    driveFileMd5: 'md5',
  };
  const repo: any = {
    findOne: jest.fn().mockResolvedValue(row),
    create: jest.fn(),
    save: jest.fn(),
  };
  const work: any = {
    id: 200,
    firebase_id: 'owner',
    business_number: '123',
    drive_file_id: 'file',
    filename: 'test.pdf',
    content_hash: createHash('sha256').update(bytes).digest('hex'),
    email_lease_token: 'token',
    email_claim_id: null,
    email_ai_state: 'NOT_SENT',
  };
  const service: any = Object.create(DocumentsService.prototype);
  const store: any = {
    enabled: () => true,
    work: async () => work,
    transaction: async (fn: any) => fn({ getRepository: () => repo }),
    query: jest.fn().mockResolvedValue({ affectedRows: 1 }),
  };
  Object.assign(service, {
    emailStore: store,
    businessRepo: { findOne: async () => ({ id: 5 }) },
    userRepo: { findOneBy: async () => ({ index: 7 }) },
    googleDriveService: {
      getIntakeFileMetadata: async () => ({ md5Checksum: 'md5' }),
      downloadFile: async () => bytes,
    },
    buildExtractionCatalog: jest.fn().mockResolvedValue([]),
  });
  return { service, work, row, repo, store };
}
it('links a completed owned result without modifying it or calling AI', async () => {
  const t = setup();
  const ctx = await t.service.prepareEmailWork(t.work, 'token', false);
  expect(ctx.alreadyHandled).toBe(true);
  expect(t.work.email_claim_id).toBe(9);
  expect(t.work.email_ai_state).toBe('EXISTING_RESULT');
  expect(t.work.email_decision).toBe('UNCERTAIN');
  expect(t.repo.save).not.toHaveBeenCalled();
  expect(t.service.buildExtractionCatalog).not.toHaveBeenCalled();
});
it('does not replay an existing processing claim with unknown ownership of the paid attempt', async () => {
  const t = setup('processing');
  await expect(
    t.service.prepareEmailWork(t.work, 'token', false),
  ).rejects.toThrow('unknown');
  expect(t.store.query).not.toHaveBeenCalled();
});
it('rejects changed content rather than trusting the old filename or claim', async () => {
  const t = setup();
  t.work.content_hash = 'different';
  await expect(
    t.service.prepareEmailWork(t.work, 'token', false),
  ).rejects.toThrow('content changed');
  expect(t.store.query).not.toHaveBeenCalled();
});
it('never creates an AI claim for an unexpected already-processed file', async () => {
  const t = setup();
  t.repo.findOne.mockResolvedValue(null);
  await expect(
    t.service.prepareEmailWork(t.work, 'token', false),
  ).rejects.toThrow('no safe prior');
  expect(t.repo.create).not.toHaveBeenCalled();
});
it('rejects a claim from another user before linking it', async () => {
  const t = setup();
  t.row.userId = 999;
  await expect(
    t.service.prepareEmailWork(t.work, 'token', false),
  ).rejects.toThrow('Foreign');
  expect(t.store.query).not.toHaveBeenCalled();
});
