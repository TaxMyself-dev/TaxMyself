import { createHash } from 'crypto';
import { DocumentsService } from '../documents/documents.service';
import { AnalysisInputError } from './document-ai.types';
const bytes = Buffer.from('artificial attachment'),
  hash = createHash('sha256').update(bytes).digest('hex');
const saved = { ...process.env };
beforeEach(() =>
  Object.assign(process.env, {
    DOCUMENT_AI_LIMIT_GROUP: 'test',
    DOCUMENT_AI_MAX_CONCURRENCY: '8',
    DOCUMENT_AI_RPM: '60',
    DOCUMENT_AI_ITPM: '60000',
    DOCUMENT_AI_OTPM: '6000',
    DOCUMENT_AI_PDF_PAGE_TOKENS: '1000',
    DOCUMENT_AI_IMAGE_TOKENS: '1000',
    DOCUMENT_AI_OUTPUT_ESTIMATE: '100',
  }),
);
afterEach(() => {
  process.env = { ...saved };
});
function subject() {
  const job: any = {
    id: 'id',
    owner: 'owner',
    business: 'biz',
    state: 'UPLOADING',
    filename: 'sample.png',
    mime_type: 'image/png',
    source: 'MANUAL_UPLOAD',
    content_hash: hash,
    lease_token: 'lease',
    purpose: 'DOCUMENT',
    context_json: {},
  };
  const queue: any = {
    enqueue: jest.fn(async (input) => ({
      ...job,
      ...(input.fileId ? { state: 'READY', drive_file_id: input.fileId } : {}),
      purpose: input.purpose,
      context_json: input.context,
    })),
    claimUpload: jest.fn(async (j) => ({ ...j, lease_token: 'lease' })),
    bindUpload: jest.fn(async (j, id, folder) => ({
      ...j,
      state: 'READY',
      drive_file_id: id,
      drive_folder_id: folder,
    })),
    reusableResult: jest.fn().mockResolvedValue(null),
    get: jest.fn().mockResolvedValue(job),
    unfinishedUploads: jest.fn().mockResolvedValue([job]),
    patch: jest.fn(async (j, v) => Object.assign(j, v)),
  };
  const drive: any = {
    ensureAnalysisTemporary: jest.fn().mockResolvedValue('temp'),
    ensureIntakeStaging: jest.fn().mockResolvedValue('staging'),
    findProtectedUploads: jest.fn().mockResolvedValue([]),
    uploadProtectedFile: jest.fn().mockResolvedValue('file'),
    getIntakeFileMetadata: jest
      .fn()
      .mockResolvedValue({ parents: ['inbox'], md5Checksum: 'md5' }),
    downloadFile: jest.fn().mockResolvedValue(bytes),
    deleteIntakeFile: jest.fn(),
  };
  Object.assign(queue, {
    canonicalFile: jest.fn().mockResolvedValue(null),
    expiredPrefills: jest.fn().mockResolvedValue([]),
    finishCleanup: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
  });
  const service: any = Object.create(DocumentsService.prototype);
  Object.assign(service, {
    analysisQueue: queue,
    googleDriveService: drive,
    documentProcessor: { isSupportedMimeType: () => true, extract: jest.fn() },
    importedDocumentRepo: { findOne: jest.fn().mockResolvedValue(null) },
    extractedDocRepo: { save: jest.fn() },
    dataSource: { transaction: jest.fn() },
    emailStore: {
      assertRetained: jest.fn(),
      work: jest
        .fn()
        .mockResolvedValue({ email_lease_token: 'lease', size: bytes.length }),
      updateWork: jest.fn(),
    },
    assertBusinessOwnership: jest.fn(),
    analysisBusiness: jest
      .fn()
      .mockResolvedValue({
        user: { index: 1 },
        business: {
          driveFolderId: 'business',
          driveInboxFolderId: 'inbox',
          driveProcessedFolderId: 'processed',
        },
      }),
  });
  service.extractedDocRepo.find = jest.fn().mockResolvedValue([]);
  Object.assign(service.emailStore, {
    transaction: async (fn) => fn({ transactionIdentity: 'handoff' }),
    query: jest.fn().mockResolvedValue({ affectedRows: 1 }),
  });
  return { service, queue, drive, job };
}
describe('all-source queue entry points (offline)', () => {
  it('reports ready work as pending processing while it waits for admission',async()=>{const t=subject();t.queue.pendingForBusiness=jest.fn().mockResolvedValue([{state:'READY'}]);await expect(t.service.getInboxProcessingStatus('owner','biz')).resolves.toEqual({pendingDocuments:1,processing:true});});
  it('returns the dedicated locked status while retaining the protected original', async () => {
    const t = subject();
    t.service.protectedPdf = {
      inspection: {
        inspect: jest.fn().mockResolvedValue({ kind: 'password_required' }),
      },
      storeLocked: jest
        .fn()
        .mockResolvedValue({ driveFileId: 'locked-original' }),
    };
    t.drive.getFolderParents = jest.fn().mockResolvedValue(['blocked']);
    t.queue.markPassword = jest.fn(async (j) => ({
      ...j,
      state: 'PASSWORD_REQUIRED',
    }));
    await expect(
      t.service.queueBufferAnalysis(
        'owner',
        'biz',
        bytes,
        'locked.pdf',
        'application/pdf',
        'DOCUMENT',
      ),
    ).resolves.toMatchObject({
      state: 'PASSWORD_REQUIRED',
      driveFileId: 'locked-original',
    });
    expect(t.service.documentProcessor.extract).not.toHaveBeenCalled();
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('reuses a retained owned file across intake purposes without uploading another copy', async () => {
    const t = subject();
    t.queue.canonicalFile.mockResolvedValue({
      driveFileId: 'existing-file',
      driveFolderId: 'processed',
    });
    await t.service.queueBufferAnalysis(
      'owner',
      'biz',
      bytes,
      'sample.png',
      'image/png',
      'TRANSACTION_LINK',
      { transactionId: 17 },
    );
    expect(t.queue.enqueue.mock.calls[0][0]).toMatchObject({
      fileId: 'existing-file',
      purpose: 'TRANSACTION_LINK',
    });
    expect(t.drive.uploadProtectedFile).not.toHaveBeenCalled();
  });
  it('does not turn an invalid saved AI response into a successful empty classification', async () => {
    const t = subject();
    await expect(
      t.service.completeQueuedAnalysis(t.job, {
        invoices: null,
        rawResponse: 'truncated',
      }),
    ).rejects.toThrow('INVALID_AI_RESPONSE');
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('retries file completion without overwriting reviewed fields or sending AI again', async () => {
    const t = subject();
    Object.assign(t.job, {
      drive_file_id: 'file',
      drive_folder_id: 'staging',
      claim_id: 7,
    });
    const claim: any = { id: 7, status: 'processing', driveFileId: 'file' },
      repository = {
        findOne: jest.fn().mockResolvedValue(claim),
        save: jest.fn(),
        find: jest.fn().mockResolvedValue([claim]),
      };
    t.service.dataSource.transaction.mockImplementation((fn) =>
      fn({ getRepository: () => repository }),
    );
    t.service.buildExtractionCatalog = jest.fn().mockResolvedValue([]);
    t.service.extractedDocRepo.findOneBy = jest.fn().mockResolvedValue(claim);
    t.drive.moveFile = jest
      .fn()
      .mockRejectedValueOnce(new Error('Drive busy'))
      .mockResolvedValue(undefined);
    await expect(
      t.service.completeQueuedAnalysis(t.job, {
        invoices: [],
        rawResponse: 'valid empty',
      }),
    ).rejects.toThrow('Drive busy');
    expect(claim.status).toBe('no_invoice_found');
    expect(repository.save).toHaveBeenCalledTimes(1);
    claim.supplier = 'edited after result save';
    await t.service.completeQueuedAnalysis(t.job, {
      invoices: [],
      rawResponse: 'valid empty',
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(claim.supplier).toBe('edited after result save');
    expect(t.service.documentProcessor.extract).not.toHaveBeenCalled();
  });
  it('never deletes a shared temporary file', async () => {
    const t = subject();
    Object.assign(t.job, {
      purpose: 'FORM_FILL',
      drive_file_id: 'file',
      context_json: { temporaryUpload: true },
    });
    t.drive.getIntakeFileMetadata.mockResolvedValue({
      parents: ['temp'],
      appProperties: { keepintaxProtectedOperation: 'id' },
    });
    t.queue.query.mockResolvedValue([{ reason: 'document' }]);
    await t.service.cleanupQueuedPrefill(t.job);
    expect(t.queue.finishCleanup).toHaveBeenCalledWith(t.job, 'SHARED');
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('does not delete a form-fill reference to an original document', async () => {
    const t = subject();
    Object.assign(t.job, {
      purpose: 'FORM_FILL',
      drive_file_id: 'file',
      context_json: { temporaryUpload: false },
    });
    await t.service.cleanupQueuedPrefill(t.job);
    expect(t.queue.finishCleanup).toHaveBeenCalledWith(t.job, 'DONE');
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('requires positive deletion acknowledgement for an owned expired temporary file', async () => {
    const t = subject();
    Object.assign(t.job, {
      purpose: 'FORM_FILL',
      drive_file_id: 'file',
      context_json: { temporaryUpload: true },
    });
    t.drive.getIntakeFileMetadata.mockResolvedValue({
      parents: ['temp'],
      appProperties: { keepintaxProtectedOperation: 'id' },
    });
    t.drive.deleteIntakeFile.mockResolvedValue('UNCONFIRMED');
    await expect(t.service.cleanupQueuedPrefill(t.job)).rejects.toThrow(
      'unconfirmed',
    );
    expect(t.queue.finishCleanup).not.toHaveBeenCalled();
  });
  it('does not delete a file with a changed operation tag', async () => {
    const t = subject();
    Object.assign(t.job, {
      purpose: 'FORM_FILL',
      drive_file_id: 'file',
      context_json: { temporaryUpload: true },
    });
    t.drive.getIntakeFileMetadata.mockResolvedValue({
      parents: ['temp'],
      appProperties: { keepintaxProtectedOperation: 'other' },
    });
    await t.service.cleanupQueuedPrefill(t.job);
    expect(t.queue.finishCleanup).toHaveBeenCalledWith(t.job, 'ATTENTION');
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('reserves a private temporary form-fill job before upload without executing AI or creating archive rows', async () => {
    const t = subject();
    const result = await t.service.queueBufferAnalysis(
      'owner',
      'biz',
      bytes,
      'sample.png',
      'image/png',
      'FORM_FILL',
      {},
      'actor',
    );
    expect(result.queued).toBe(true);
    expect(t.queue.enqueue.mock.calls[0][0]).toMatchObject({
      owner: 'owner',
      business: 'biz',
      actor: 'actor',
      purpose: 'FORM_FILL',
      context: { temporaryUpload: true },
    });
    expect(t.queue.enqueue.mock.invocationCallOrder[0]).toBeLessThan(
      t.drive.uploadProtectedFile.mock.invocationCallOrder[0],
    );
    expect(t.drive.ensureAnalysisTemporary).toHaveBeenCalledWith('business');
    expect(t.service.documentProcessor.extract).not.toHaveBeenCalled();
    expect(t.service.extractedDocRepo.save).not.toHaveBeenCalled();
  });
  it('returns an upload receipt for manual documents, not a synchronous extraction', async () => {
    const t = subject();
    const result = await t.service.queueBufferAnalysis(
      'owner',
      'biz',
      bytes,
      'sample.png',
      'image/png',
      'DOCUMENT',
    );
    expect(result).toMatchObject({
      queued: true,
      state: 'READY',
      driveFileId: 'file',
    });
    expect(t.drive.ensureIntakeStaging).toHaveBeenCalled();
    expect(t.service.documentProcessor.extract).not.toHaveBeenCalled();
  });
  it('does not upload when business ownership fails', async () => {
    const t = subject();
    t.service.analysisBusiness.mockRejectedValue(new Error('foreign'));
    await expect(
      t.service.queueBufferAnalysis(
        'owner',
        'other',
        bytes,
        'sample.png',
        'image/png',
        'DOCUMENT',
      ),
    ).rejects.toThrow('foreign');
    expect(t.drive.uploadProtectedFile).not.toHaveBeenCalled();
    expect(t.queue.enqueue).not.toHaveBeenCalled();
  });
  it('hands Gmail work to the shared queue in the same transaction instead of calling the model', async () => {
    const t = subject();
    const work: any = {
      id: 17,
      firebase_id: 'owner',
      business_number: 'biz',
      content_hash: hash,
      filename: 'sample.png',
      mime_type: 'image/png',
      drive_file_id: 'file',
      drive_folder_id: 'inbox',
    };
    await t.service.queueEmailWork(work, 'lease');
    expect(t.queue.enqueue.mock.calls[0][0]).toMatchObject({
      purpose: 'GMAIL',
      context: { importId: 17 },
      fileId: 'file',
    });
    const manager = t.queue.enqueue.mock.calls[0][2];
    expect(manager).toEqual({ transactionIdentity: 'handoff' });
    expect(t.service.emailStore.query.mock.calls[0][2]).toBe(manager);
    expect(work.email_work_state).toBe('AI_QUEUED');
    expect(t.service.documentProcessor.extract).not.toHaveBeenCalled();
  });
  it('rejects a stale Gmail lease before enqueueing', async () => {
    const t = subject();
    await expect(
      t.service.queueEmailWork(
        { id: 17, firebase_id: 'owner', business_number: 'biz' },
        'stale',
      ),
    ).rejects.toThrow('lease changed');
    expect(t.queue.enqueue).not.toHaveBeenCalled();
  });
  it('fails changed content before claim or AI', async () => {
    const t = subject();
    await expect(
      t.service.prepareQueuedAnalysis(
        { ...t.job, drive_file_id: 'file', content_hash: 'f'.repeat(64) },
        {},
      ),
    ).rejects.toThrow('CONTENT_CHANGED');
    expect(t.service.dataSource.transaction).not.toHaveBeenCalled();
  });
  it('rejects a foreign folder before downloading the file', async () => {
    const t = subject();
    t.drive.getIntakeFileMetadata
      .mockResolvedValueOnce({ parents: ['foreign-folder'] })
      .mockResolvedValueOnce({ parents: ['other-business'] });
    await expect(
      t.service.prepareQueuedAnalysis({ ...t.job, drive_file_id: 'file' }, {}),
    ).rejects.toThrow('FOREIGN_DOCUMENT');
    expect(t.drive.downloadFile).not.toHaveBeenCalled();
  });
  it('form-fill completion does not create documents or delete a file', async () => {
    const t = subject();
    const result = await t.service.completeQueuedAnalysis(
      { ...t.job, purpose: 'FORM_FILL' },
      { invoices: [{ amount: 25 }], rawResponse: 'private' },
    );
    expect(result).toEqual({ invoice: { amount: 25 }, invoicesCount: 1 });
    expect(t.service.dataSource.transaction).not.toHaveBeenCalled();
    expect(t.drive.deleteIntakeFile).not.toHaveBeenCalled();
  });
  it('recovers the tagged uploaded bytes without a second upload', async () => {
    const t = subject();
    t.drive.findProtectedUploads.mockResolvedValue(['already-uploaded']);
    await t.service.recoverQueuedUploads();
    expect(t.queue.bindUpload).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id' }),
      'already-uploaded',
      'staging',
    );
    expect(t.drive.uploadProtectedFile).not.toHaveBeenCalled();
  });
  it('status exposes no provider/raw-response/context payload', async () => {
    const t = subject();
    Object.assign(t.job, {
      state: 'COMPLETED',
      completion_json: { invoice: null },
      result_json: { rawResponse: 'private' },
      context_json: { private: 'data' },
      provider: 'private-provider',
    });
    const status = await t.service.getAnalysisStatus('owner', 'biz', 'id');
    expect(status).toEqual({
      jobId: 'id',
      state: 'COMPLETED',
      errorCode: undefined,
      completion: { invoice: null },
    });
  });
});
