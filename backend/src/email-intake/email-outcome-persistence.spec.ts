import { DocumentsService } from '../documents/documents.service';
import { ExtractedDocStatus } from '../documents/extracted-document.entity';
import { ArchiveItemStatus } from '../enum';
function setup() {
  const claim: any = {
    id: 9,
    userId: 7,
    businessNumber: '123',
    driveFileId: 'file',
    subIndex: 0,
    status: ExtractedDocStatus.PROCESSING,
    uploadDate: new Date('2026-11-19'),
    driveFileMd5: 'md5',
  };
  const rows: any[] = [claim];
  let next = 10;
  const repository: any = {
    findOneBy: jest.fn(async () => claim),
    find: jest.fn(async () => rows),
    create: jest.fn((value: any) => ({ ...value })),
    save: jest.fn(async (value: any) => {
      for (const row of Array.isArray(value) ? value : [value]) {
        if (!row.id) {
          row.id = next++;
          rows.push(row);
        }
      }
      return value;
    }),
  };
  const work: any = {
    id: 200,
    firebase_id: 'owner',
    business_number: '123',
    drive_file_id: 'file',
    filename: 'file.pdf',
    email_lease_token: 'token',
    email_claim_id: 9,
  };
  const store: any = {
    enabled: () => true,
    transaction: async (fn: any) => fn({ getRepository: () => repository }),
    work: async () => work,
    query: jest.fn().mockResolvedValue({ affectedRows: 1 }),
  };
  const service: any = Object.create(DocumentsService.prototype);
  Object.assign(service, {
    emailStore: store,
    buildExtractionCatalog: async () => [],
    extractedDocRepo: repository,
  });
  return { service, store, work, claim, rows, repository };
}
describe('durable outcomes through existing document persistence (offline)', () => {
  it('uncertain creates the ordinary pending record with no fabricated fields or special note', async () => {
    const t = setup();
    await t.service.persistEmailWork(t.work, 'token', {
      intakeDecision: 'uncertain',
      invoices: null,
    });
    expect(t.claim.status).toBe('pending_review');
    expect(t.claim.rejectionReason).toBeNull();
    expect(t.claim.rawResponse).toBeNull();
    expect(t.claim.amount).toBeUndefined();
    expect(t.claim.date).toBeUndefined();
    expect(t.service.archiveItemStatusForDocument(t.claim, new Map())).toBe(
      ArchiveItemStatus.PENDING,
    );
    expect(t.store.query).toHaveBeenCalledWith(
      expect.stringContaining('email_decision'),
      ['MOVE_PROCESSED', 'UNCERTAIN', null, 200, 'token'],
      expect.anything(),
    );
  });
  it('persists all recognized policy/fee rows through the shared normalizer without duplicate subdocuments on resume', async () => {
    const t = setup();
    const result = {
      intakeDecision: 'accounting',
      invoices: [
        { document_type: 'insurance_policy' },
        { document_type: 'license_fee' },
      ],
      rawResponse: 'synthetic',
    };
    await t.service.persistEmailWork(t.work, 'token', result);
    await t.service.persistEmailWork(t.work, 'token', result);
    expect(t.rows).toHaveLength(2);
    expect(t.rows.map((row) => row.documentType)).toEqual([
      'insurance_policy',
      'license_fee',
    ]);
    expect(
      t.rows.every(
        (row) => row.amount === null && row.confirmedExpenseId == null,
      ),
    ).toBe(true);
  });
  it('does not persist after a newer worker acquired the claim', async () => {
    const t = setup();
    await expect(
      t.service.persistEmailWork(t.work, 'stale', {
        intakeDecision: 'uncertain',
        invoices: null,
      }),
    ).rejects.toThrow('lease');
    expect(t.repository.save).not.toHaveBeenCalled();
  });
});
