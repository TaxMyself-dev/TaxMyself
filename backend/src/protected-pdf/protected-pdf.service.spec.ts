import { ProtectedPdfService } from './protected-pdf.service';
import { ProtectedPdfWorker } from './protected-pdf.worker';
const bytes = Buffer.from('%PDF-open-copy');
function subject() {
  const root: any = {
    id: 7,
    firebase_id: 'owner',
    business_number: '123',
    filename: 'locked.pdf',
    source: 'GMAIL',
    status: 'PASSWORD_REQUIRED',
    original_import_id: 41,
    original_drive_id: 'original',
    version: 0,
    current_operation_id: null,
    lease_token: null,
    created_at: new Date(),
  };
  const operations = new Map<string, any>();
  let ledger: any[] = [
    {
      id: 41,
      firebaseId: 'owner',
      businessNumber: '123',
      source: 'GMAIL',
      contentHash: 'locked-hash',
      driveFileId: 'original',
      driveFileName: 'locked.pdf',
      driveFolderId: 'blocked',
      filename: 'locked.pdf',
      gmailMessageId: 'mail-1',
      gmailAttachmentId: 'att-1',
    },
  ];
  let nextId = 42;
  const repo: any = {
    findOne: jest.fn(
      async ({ where }: any) =>
        ledger.find((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v),
        ) || null,
    ),
    create: (r: any) => ({ ...r }),
    save: jest.fn(async (r: any) => {
      const saved = { ...r, id: nextId++ };
      ledger.push(saved);
      return saved;
    }),
  };
  let serial: Promise<any> = Promise.resolve();
  const store: any = {
    root: jest.fn(async (id: number, owner: string, biz: string) =>
      id === 7 && owner === 'owner' && biz === '123' ? root : undefined,
    ),
    operation: jest.fn(async (id: string) => operations.get(id)),
    transaction: jest.fn((work: any) => {
      const run = serial.then(async () => {
        const snap = {
          root: structuredClone(root),
          ops: structuredClone([...operations]),
          ledger: structuredClone(ledger),
        };
        try {
          return await work({ getRepository: () => repo });
        } catch (e) {
          Object.keys(root).forEach((k) => delete root[k]);
          Object.assign(root, snap.root);
          operations.clear();
          snap.ops.forEach(([id, op]: any) => operations.set(id, op));
          ledger = snap.ledger;
          throw e;
        }
      });
      serial = run.catch(() => undefined);
      return run;
    }),
    query: jest.fn(async (sql: string, a: any[]) => {
      if (
        sql.startsWith(
          'SELECT * FROM document_replacement_operations WHERE protected_id',
        )
      )
        return [...operations.values()].filter(
          (o) => o.protected_id === a[0] && o.idempotency_key === a[1],
        );
      if (sql.startsWith('INSERT INTO document_replacement_operations')) {
        const [
          id,
          protected_id,
          firebase_id,
          business_number,
          actor_id,
          idempotency_key,
          content_hash,
          filename,
          size,
          expected_version,
        ] = a;
        operations.set(id, {
          id,
          protected_id,
          firebase_id,
          business_number,
          actor_id,
          idempotency_key,
          content_hash,
          filename,
          size,
          expected_version,
          status: 'RESERVED',
          processing_status: 'NOT_STARTED',
          attempts: 0,
        });
      } else if (sql.startsWith('UPDATE protected_documents SET version'))
        Object.assign(root, {
          version: a[0],
          lease_token: a[1],
          lease_expires_at: new Date(Date.now() + 300000),
        });
      else if (
        sql.startsWith(
          "UPDATE document_replacement_operations SET status='RESERVED'",
        )
      )
        Object.assign(operations.get(a[1]), {
          status: 'RESERVED',
          expected_version: a[0],
        });
      else if (
        sql.startsWith(
          'UPDATE document_replacement_operations SET lease_token=',
        )
      )
        Object.assign(operations.get(a[1]), {
          lease_token: a[0],
          lease_expires_at: new Date(Date.now() + 300000),
        });
      else if (
        sql.startsWith(
          'UPDATE document_replacement_operations SET candidate_drive_id',
        )
      ) {
        const op = operations.get(a[1]);
        if (op.lease_token !== a[2] || op.expected_version !== a[3])
          return { affectedRows: 0 };
        op.candidate_drive_id = a[0];
      } else if (
        sql.startsWith(
          'UPDATE document_replacement_operations SET replacement_import_id',
        )
      )
        Object.assign(operations.get(a[1]), {
          replacement_import_id: a[0],
          status: 'PENDING',
          processing_status: 'NOT_STARTED',
        });
      else if (
        sql.startsWith("UPDATE protected_documents SET status='REPLACED'")
      )
        Object.assign(root, {
          status: 'REPLACED',
          current_operation_id: a[0],
          lease_token: null,
        });
      else if (
        sql.startsWith(
          "UPDATE document_replacement_operations SET status='UPLOAD_FAILED'",
        )
      ) {
        const op = operations.get(a[0]);
        if (op.status === 'RESERVED' && op.lease_token === a[1]) {
          op.status = 'UPLOAD_FAILED';
          op.lease_token = null;
        }
      } else if (
        sql.startsWith('UPDATE protected_documents SET lease_token=NULL')
      ) {
        if (root.lease_token === a[1]) root.lease_token = null;
      } else if (
        sql.startsWith(
          "UPDATE document_replacement_operations SET status='DISPATCHING'",
        )
      ) {
        const op = operations.get(a[1]);
        Object.assign(op, {
          status: 'DISPATCHING',
          attempts: op.attempts + 1,
          lease_token: a[0],
          lease_expires_at: new Date(Date.now() + 300000),
        });
      } else if (
        sql.startsWith(
          "UPDATE document_replacement_operations SET status='QUEUED'",
        )
      )
        Object.assign(operations.get(a[0]), {
          status: 'QUEUED',
          processing_status: 'PENDING',
          lease_token: null,
        });
      else if (
        sql.startsWith(
          "UPDATE document_replacement_operations SET status='DELIVERY_FAILED'",
        )
      )
        Object.assign(operations.get(a[0]), {
          status: 'DELIVERY_FAILED',
          lease_token: null,
        });
      else if (sql.startsWith('UPDATE imported_documents SET drive_folder_id'))
        ledger.find((r) => r.id === a[1]).driveFolderId = a[0];
      else if (sql.startsWith('SELECT id,status,processing_status'))
        return [...operations.values()];
      else if (sql.startsWith('SELECT p.*'))
        return [
          {
            ...root,
            ...(root.current_operation_id
              ? {
                  candidate_drive_id: operations.get(root.current_operation_id)
                    .candidate_drive_id,
                  replacement_status: operations.get(root.current_operation_id)
                    .status,
                  processing_status: operations.get(root.current_operation_id)
                    .processing_status,
                }
              : {
                  candidate_drive_id: null,
                  replacement_status: null,
                  processing_status: null,
                }),
          },
        ];
      else if (sql.startsWith('SELECT o.candidate_drive_id'))
        return [...operations.values()]
          .filter((o) => o.id !== root.current_operation_id)
          .map((o) => ({ candidate_drive_id: o.candidate_drive_id }));
      else if (sql.startsWith('UPDATE imported_documents r JOIN protected_documents') || sql.startsWith('UPDATE imported_documents r JOIN document_replacement_operations') || sql.startsWith('UPDATE imported_documents original JOIN protected_documents')) return {affectedRows:0}; // This legacy fixture has no original Gmail ledger; covered separately by email-protected-handoff.spec.
      else throw new Error('Unimplemented fake SQL: ' + sql);
      return { affectedRows: 1 };
    }),
  };
  const businesses = {
    findOne: jest.fn(async ({ where }: any) =>
      where.firebaseId === 'owner' && where.businessNumber === '123'
        ? {
            firebaseId: 'owner',
            businessNumber: '123',
            driveFolderId: 'business',
            driveInboxFolderId: 'inbox',
            driveProcessedFolderId: 'processed',
          }
        : null,
    ),
  };
  const inspection = {
    inspect: jest.fn().mockResolvedValue({ kind: 'readable', pages: 1 }),
  };
  const drive = {
    ensureProtectedFolders: jest
      .fn()
      .mockResolvedValue({ blocked: 'blocked', staging: 'staging' }),
    findProtectedUploads: jest.fn().mockResolvedValue([]),
    uploadProtectedFile: jest.fn().mockResolvedValue('candidate'),
    downloadFile: jest.fn().mockResolvedValue(bytes),
    getFolderParents: jest.fn().mockResolvedValue(['staging']),
    moveFile: jest.fn().mockResolvedValue(undefined),
  };
  const extracted = { find: jest.fn().mockResolvedValue([]) };
  const service = new ProtectedPdfService(
    store,
    inspection as any,
    businesses as any,
    repo,
    extracted as any,
    drive as any,
  );
  const replace = (key = 'test-request-0001', owner = 'owner', biz = '123') =>
    service.replace(owner, 'actor', biz, 7, key, true, {
      buffer: bytes,
      originalname: 'open.pdf',
      mimetype: 'application/pdf',
    });
  return {
    root,
    operations,
    extracted,
    store,
    repo,
    inspection,
    drive,
    service,
    replace,
    ledger: () => ledger,
  };
}
describe('Protected PDF replacement boundaries (offline)', () => {
  const original = process.env.PROTECTED_PDF_ENABLED,
    dispatch = process.env.PROTECTED_PDF_DISPATCH_ENABLED;
  beforeEach(() => {
    process.env.PROTECTED_PDF_ENABLED = 'true';
    process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'true';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.PROTECTED_PDF_ENABLED;
    else process.env.PROTECTED_PDF_ENABLED = original;
    if (dispatch === undefined)
      delete process.env.PROTECTED_PDF_DISPATCH_ENABLED;
    else process.env.PROTECTED_PDF_DISPATCH_ENABLED = dispatch;
  });
  it('authorizes owner/business before parsing or uploading', async () => {
    const t = subject();
    await expect(t.replace('test-request-0001', 'other')).rejects.toThrow(
      'Document not found',
    );
    await expect(
      t.replace('test-request-0001', 'owner', 'other'),
    ).rejects.toThrow('Document not found');
    expect(t.inspection.inspect).not.toHaveBeenCalled();
    expect(t.drive.uploadProtectedFile).not.toHaveBeenCalled();
  });
  it('requires explicit user confirmation', async () => {
    const t = subject();
    await expect(
      t.service.replace(
        'owner',
        'actor',
        '123',
        7,
        'test-request-0001',
        false,
        {
          buffer: bytes,
          originalname: 'open.pdf',
          mimetype: 'application/pdf',
        },
      ),
    ).rejects.toThrow();
    expect(t.drive.uploadProtectedFile).not.toHaveBeenCalled();
  });
  it.each(['password_required', 'invalid', 'limit'])(
    'rejects %s while retaining original',
    async (kind) => {
      const t = subject();
      t.inspection.inspect.mockResolvedValue({ kind } as any);
      await expect(t.replace()).rejects.toThrow();
      expect(t.root.status).toBe('PASSWORD_REQUIRED');
      expect(t.ledger()).toHaveLength(1);
      expect(t.drive.uploadProtectedFile).not.toHaveBeenCalled();
    },
  );
  it('commits provenance, but does not delete the source or expose staging to OCR', async () => {
    const t = subject();
    const result = await t.replace();
    expect(result.accepted).toBe(true);
    expect(result.processingStatus).toBe('NOT_STARTED');
    expect(t.root.status).toBe('REPLACED');
    expect(t.root.original_drive_id).toBe('original');
    expect(t.ledger()[1]).toMatchObject({
      firebaseId: 'owner',
      businessNumber: '123',
      source: 'GMAIL',
      gmailMessageId: 'mail-1',
      gmailAttachmentId: 'att-1',
      driveFolderId: 'staging',
    });
    expect(t.drive.moveFile).not.toHaveBeenCalled();
  });
  it('returns the same accepted operation without another upload', async () => {
    const t = subject();
    const result = await t.replace();
    expect(await t.replace()).toEqual(result);
    expect(t.drive.uploadProtectedFile).toHaveBeenCalledTimes(1);
    expect(t.ledger()).toHaveLength(2);
    await expect(t.replace('test-request-0002')).rejects.toThrow(
      'Replacement already accepted',
    );
  });
  it('refuses hash-based association with an independently registered document', async () => {
    const t = subject();
    t.ledger().push({
      id: 99,
      firebaseId: 'owner',
      businessNumber: '123',
      contentHash: require('crypto')
        .createHash('sha256')
        .update(bytes)
        .digest('hex'),
    });
    await expect(t.replace()).rejects.toThrow('already linked');
    expect(t.root.status).toBe('PASSWORD_REQUIRED');
    expect(t.root.original_drive_id).toBe('original');
  });
  it('recovers upload after transaction failure using the same request key', async () => {
    const t = subject();
    t.repo.save.mockRejectedValueOnce(new Error('fake DB failure'));
    await expect(t.replace()).rejects.toThrow('העלאת החלופה');
    expect(t.root.status).toBe('PASSWORD_REQUIRED');
    expect(t.ledger()).toHaveLength(1);
    expect((await t.replace()).accepted).toBe(true);
    expect(t.drive.uploadProtectedFile).toHaveBeenCalledTimes(1);
    expect(t.ledger()).toHaveLength(2);
  });
  it('allows only one of two simultaneous replacement requests', async () => {
    const t = subject();
    const results = await Promise.allSettled([
      t.replace(),
      t.replace('test-request-0002'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(t.drive.uploadProtectedFile).toHaveBeenCalledTimes(1);
  });
  it('acknowledges a move completed before a crash without moving again', async () => {
    const t = subject();
    const accepted = await t.replace();
    const op = t.operations.get(accepted.operationId);
    op.status = 'DISPATCHING';
    op.lease_expires_at = new Date(0);
    t.drive.getFolderParents.mockResolvedValue(['inbox']);
    await new ProtectedPdfWorker(t.service, t.store, t.drive as any).deliver(
      op.id,
    );
    expect(t.drive.moveFile).not.toHaveBeenCalled();
    expect(op.status).toBe('QUEUED');
    expect(op.processing_status).toBe('PENDING');
  });
  it('delivers a committed copy once and retains the protected original', async () => {
    const t = subject();
    const accepted = await t.replace();
    const worker = new ProtectedPdfWorker(t.service, t.store, t.drive as any);
    await worker.deliver(accepted.operationId);
    await worker.deliver(accepted.operationId);
    expect(t.drive.moveFile).toHaveBeenCalledTimes(1);
    expect(t.drive.moveFile).toHaveBeenCalledWith(
      'candidate',
      'staging',
      'inbox',
    );
    expect(t.root.original_drive_id).toBe('original');
  });
  it('shows one logical item, hiding the original and old projections', async () => {
    const t = subject();
    const locked = await t.service.decorateArchive(
      'owner',
      '123',
      [{ id: 99, driveFileId: 'original', status: 'ERROR' }],
      true,
    );
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatchObject({
      status: 'PASSWORD_REQUIRED',
      protectedDocumentId: 7,
      canUploadOpenCopy: true,
    });
    await t.replace();
    const items = await t.service.decorateArchive(
      'owner',
      '123',
      [
        { id: 100, driveFileId: 'candidate', status: 'PENDING' },
        { id: 99, driveFileId: 'original', status: 'ERROR' },
      ],
      true,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 100,
      protectedDocumentId: 7,
      canUploadOpenCopy: false,
    });
  });
  it('keeps a locked document separate from expense and transaction rows without Drive files', async () => {
    const t = subject();
    t.root.candidate_drive_id = null; // LEFT JOIN without a replacement returns SQL NULL.
    const unrelated = [
      { id: 1, itemType: 'EXPENSE', driveFileId: null, status: 'PENDING' },
      { id: 2, itemType: 'TRANSACTION', driveFileId: null, status: 'PENDING' },
    ];
    const items = await t.service.decorateArchive(
      'owner',
      '123',
      unrelated,
      true,
    );
    const locked = items.filter((item) => item.status === 'PASSWORD_REQUIRED');
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatchObject({
      protectedDocumentId: 7,
      driveFileId: 'original',
      canUploadOpenCopy: true,
    });
    expect(unrelated.every((item) => !('protectedDocumentId' in item))).toBe(
      true,
    );
    expect(items).toHaveLength(3);
  });
  it('projects legacy empty-invoice outcomes in the archive and history without rewriting stored failures', async () => {
    const t = subject();
    const accepted = await t.replace();
    const op = t.operations.get(accepted.operationId);
    op.status = 'QUEUED';
    op.processing_status = 'FAILED';
    t.extracted.find.mockResolvedValue([
      {
        status: 'error',
        rawResponse: '{"invoices":[]}',
        rejectionReason: null,
      },
    ]);
    const items = await t.service.decorateArchive(
      'owner',
      '123',
      [{ id: 101, driveFileId: 'candidate', status: 'NO_INVOICE_FOUND' }],
      true,
    );
    expect(items[0].replacementProcessingStatus).toBe('NO_INVOICE_FOUND');
    expect(
      (await t.service.history('owner', '123', 7)).operations[0]
        .processing_status,
    ).toBe('NO_INVOICE_FOUND');
    expect(op.processing_status).toBe('FAILED');
    expect(t.extracted.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driveFileId: 'candidate', businessNumber: '123' },
      }),
    );
  });
  it('makes protected PDF handling available without an activation switch', () => {
    expect(subject().service.enabled()).toBe(true);
  });

  it('fences a late upload attempt so it cannot undo a newer retry', async () => {
    const t = subject();
    let finishLate: (value: string) => void;
    t.drive.uploadProtectedFile
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finishLate = resolve;
          }),
      )
      .mockResolvedValueOnce('new-candidate');
    const late = t.replace();
    late.catch(() => undefined);
    while (!finishLate) await new Promise((resolve) => setImmediate(resolve));
    t.root.lease_expires_at = new Date(0);
    const accepted = await t.replace();
    finishLate('late-candidate');
    await expect(late).rejects.toThrow('reservation');
    expect(t.root.status).toBe('REPLACED');
    expect(t.operations.get(accepted.operationId).status).toBe('PENDING');
    expect(t.ledger()).toHaveLength(2);
    expect(t.ledger()[1].driveFileId).toBe('new-candidate');
  });
  it('stops automatic delivery after its retry budget without reuploading', async () => {
    const t = subject();
    const accepted = await t.replace();
    const op = t.operations.get(accepted.operationId);
    op.attempts = 5;
    await new ProtectedPdfWorker(t.service, t.store, t.drive as any).deliver(
      op.id,
    );
    expect(op.status).toBe('DELIVERY_FAILED');
    expect(t.drive.moveFile).not.toHaveBeenCalled();
    expect(t.drive.uploadProtectedFile).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['error', 'FAILED'],
    ['no_invoice_found', 'NO_INVOICE_FOUND'],
    ['pending_review', 'SUCCEEDED'],
  ])(
    'records processing %s separately from accepted upload',
    async (status, outcome) => {
      const t = subject();
      const accepted = await t.replace();
      const op = t.operations.get(accepted.operationId);
      op.status = 'QUEUED';
      op.processing_status = 'PENDING';
      t.store.query
        .mockResolvedValueOnce([op])
        .mockResolvedValueOnce([{ status }])
        .mockResolvedValueOnce({ affectedRows: 1 });
      await new ProtectedPdfWorker(
        t.service,
        t.store,
        t.drive as any,
      ).reconcile();
      expect(t.store.query).toHaveBeenLastCalledWith(
        expect.stringContaining('processing_status=?'),
        [outcome, op.id],
      );
      expect(op.status).toBe('QUEUED');
      expect(t.drive.moveFile).not.toHaveBeenCalled();
    },
  );
});
