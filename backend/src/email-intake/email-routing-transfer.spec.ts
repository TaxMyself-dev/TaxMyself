import { DocumentsService } from '../documents/documents.service';
import { Business } from '../business/business.entity';
import { ExtractedDocStatus } from '../documents/extracted-document.entity';
function fixture() {
  const plan: any = {
    version: 'recipient-v1',
    initialBusiness: '123456789',
    finalBusiness: '987654321',
    source: 'AI',
    decidedAt: '2026-11-22T00:00:00Z',
  };
  const outcome = {
    intakeDecision: 'accounting',
    invoices: [
      {
        document_type: 'invoice',
        recipient_tax_id: '987654321',
        category: 'Office',
        sub_category: 'Paper',
        tax_percent: 10,
        vat_percent: 10,
      },
    ],
    rawResponse: 'synthetic',
  };
  const work: any = {
    id: 5,
    firebase_id: 'owner',
    business_number: plan.initialBusiness,
    drive_file_id: 'same-file',
    drive_folder_id: 'source-inbox',
    filename: 'invoice.pdf',
    content_hash: 'hash',
    email_lease_token: 'token',
    email_claim_id: 9,
    email_work_state: 'ROUTING_PENDING',
    email_routing_json: plan,
    email_result_json: outcome,
  };
  const claim: any = {
    id: 9,
    userId: 7,
    businessNumber: plan.initialBusiness,
    driveFileId: 'same-file',
    status: ExtractedDocStatus.PROCESSING,
    uploadDate: new Date('2026-11-22'),
  };
  const source: any = {
    firebaseId: 'owner',
    businessNumber: plan.initialBusiness,
    driveInboxFolderId: 'source-inbox',
    driveProcessedFolderId: 'source-processed',
  };
  const target: any = {
    firebaseId: 'owner',
    businessNumber: plan.finalBusiness,
    driveInboxFolderId: 'target-inbox',
    driveProcessedFolderId: 'target-processed',
  };
  const repository: any = {
    findOne: jest.fn(async () => claim),
    find: jest.fn(async () => [claim]),
    save: jest.fn(async (value) => value),
    create: (value: any) => value,
  };
  const manager: any = {
    getRepository: (entity: any) =>
      entity === Business
        ? {
            findOne: jest.fn(async (options) =>
              [source, target].find(
                (b) =>
                  b.firebaseId === options.where.firebaseId &&
                  b.businessNumber === options.where.businessNumber,
              ),
            ),
          }
        : repository,
  };
  let duplicate = false,
    failCommit = false,
    parent = 'source-inbox';
  const store: any = {
    enabled: () => true,
    transaction: jest.fn(async (fn) => fn(manager)),
    work: jest.fn(async () => ({ ...work })),
    query: jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT id FROM imported_documents'))
        return duplicate ? [{ id: 44 }] : [];
      if (sql.startsWith('UPDATE imported_documents') && failCommit)
        throw new Error('simulated commit failure');
      return { affectedRows: 1 };
    }),
    updateWork: jest.fn(async (_w, _token, changes) =>
      Object.assign(work, changes),
    ),
  };
  const drive: any = {
    getIntakeFileMetadata: jest.fn(async () => ({ parents: [parent] })),
    moveFile: jest.fn(async (_file, _from, to) => {
      parent = to;
    }),
  };
  const service: any = Object.create(DocumentsService.prototype);
  Object.assign(service, {
    emailStore: store,
    businessRepo: {
      findOneBy: jest.fn(async (where) =>
        where.businessNumber === plan.initialBusiness ? source : target,
      ),
    },
    googleDriveService: drive,
    buildExtractionCatalog: jest.fn(async () => [
      {
        categoryName: 'Office',
        subCategoryName: 'Paper',
        taxPercent: 100,
        vatPercent: 66.67,
        isEquipment: false,
        subCategoryId: 22,
      },
    ]),
    persistExtractedRows: jest.fn(async () => {}),
  });
  return {
    service,
    work,
    claim,
    store,
    drive,
    plan,
    target,
    source,
    repository,
    setDuplicate: (value: boolean) => {
      duplicate = value;
    },
    setFail: (value: boolean) => {
      failCommit = value;
    },
    parent: () => parent,
  };
}
describe('saved AI recipient routing and same-file transfer (offline)', () => {
  it('does not commit to a destination removed during the Drive move', async () => {
    const t = fixture();
    const original = t.drive.moveFile.getMockImplementation();
    t.drive.moveFile.mockImplementation(async (...args) => {
      await original(...args);
      t.target.firebaseId = 'removed-owner';
    });
    await expect(
      t.service.completeEmailRouting(t.work, 'token'),
    ).rejects.toThrow('business changed');
    expect(t.work.email_work_state).toBe('ROUTING_PENDING');
    expect(t.service.persistExtractedRows).not.toHaveBeenCalled();
  });
  it('accepts equivalent JSON returned with MySQL key ordering', async () => {
    const t = fixture();
    t.store.work.mockImplementation(async () => ({
      ...t.work,
      email_routing_json: JSON.stringify(
        Object.fromEntries(Object.entries(t.plan).reverse()),
      ),
    }));
    await t.service.completeEmailRouting(t.work, 'token');
    expect(t.work.email_work_state).toBe('AWAITING_APPROVAL');
  });
  it('AI overrides both mailbox and sender defaults and freezes a plan before any move', async () => {
    const t = fixture();
    t.work.email_work_state = 'RESULT_SAVED';
    t.work.email_routing_json = {
      ...t.plan,
      finalBusiness: t.plan.initialBusiness,
      source: 'SENDER_RULE',
    };
    t.service.emailRouting = {
      ownedBusinesses: async () => [t.source, t.target],
    };
    await t.service.persistEmailWork(t.work, 'token', t.work.email_result_json);
    expect(t.work.email_work_state).toBe('ROUTING_PENDING');
    expect(JSON.parse(t.work.email_routing_json)).toMatchObject({
      source: 'AI',
      finalBusiness: '987654321',
    });
    expect(t.drive.moveFile).not.toHaveBeenCalled();
    expect(t.service.persistExtractedRows).not.toHaveBeenCalled();
  });
  it('moves the same file and persists against the final catalog without invoking AI', async () => {
    const t = fixture();
    await t.service.completeEmailRouting(t.work, 'token');
    expect(t.drive.moveFile).toHaveBeenCalledWith(
      'same-file',
      'source-inbox',
      'target-processed',
    );
    expect(t.work).toMatchObject({
      business_number: '987654321',
      drive_file_id: 'same-file',
      email_work_state: 'AWAITING_APPROVAL',
    });
    expect(t.service.persistExtractedRows.mock.calls[0][6][0]).toMatchObject({
      tax_percent: 100,
      vat_percent: 66.67,
    });
    expect(t.service.persistExtractedRows.mock.calls[0][1]).toBe('987654321');
    expect(t.work.email_routing_json).toMatchObject({
      initialBusiness: '123456789',
      finalBusiness: '987654321',
      source: 'AI',
      movedAt: expect.any(String),
    });
  });
  it('resumes after a successful move followed by failed database completion', async () => {
    const t = fixture();
    t.setFail(true);
    await expect(
      t.service.completeEmailRouting(t.work, 'token'),
    ).rejects.toThrow('commit failure');
    expect(t.parent()).toBe('target-processed');
    expect(t.work.business_number).toBe('123456789');
    t.setFail(false);
    await t.service.completeEmailRouting(t.work, 'token');
    expect(t.drive.moveFile).toHaveBeenCalledTimes(1);
    expect(t.work.email_work_state).toBe('AWAITING_APPROVAL');
  });
  it('retains the source and stops before moving for a duplicate, edited claim, stale lease or foreign target', async () => {
    const duplicate = fixture();
    duplicate.setDuplicate(true);
    await expect(
      duplicate.service.completeEmailRouting(duplicate.work, 'token'),
    ).rejects.toThrow('already contains');
    expect(duplicate.drive.moveFile).not.toHaveBeenCalled();
    const edited = fixture();
    edited.claim.status = ExtractedDocStatus.APPROVED;
    await expect(
      edited.service.completeEmailRouting(edited.work, 'token'),
    ).rejects.toThrow('no longer pending');
    expect(edited.drive.moveFile).not.toHaveBeenCalled();
    const stale = fixture();
    await expect(
      stale.service.completeEmailRouting(stale.work, 'other-token'),
    ).rejects.toThrow('lease');
    expect(stale.drive.moveFile).not.toHaveBeenCalled();
    const foreign = fixture();
    foreign.target.firebaseId = 'other-owner';
    await expect(
      foreign.service.completeEmailRouting(foreign.work, 'token'),
    ).rejects.toThrow('folders unavailable');
    expect(foreign.drive.moveFile).not.toHaveBeenCalled();
  });
  it('clears classification when the target catalog cannot resolve the source choice', async () => {
    const t = fixture();
    t.service.buildExtractionCatalog.mockResolvedValue([]);
    await t.service.completeEmailRouting(t.work, 'token');
    expect(t.service.persistExtractedRows.mock.calls[0][6][0]).toMatchObject({
      category: null,
      sub_category: null,
      tax_percent: null,
      vat_percent: null,
      is_equipment: null,
    });
  });
});
