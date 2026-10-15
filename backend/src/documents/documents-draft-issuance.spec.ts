import { DocumentStatusType, DocumentType } from '../enum';
import { DocumentsService } from './documents.service';

describe('DocumentsService draft issuance', () => {
  it('removes the saved draft transactionally before inserting the reserved document number', async () => {
    const manager = {};
    const queryRunner = {
      manager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const service = Object.create(DocumentsService.prototype) as any;
    service.dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    service.incrementGeneralIndex = jest.fn().mockResolvedValue({ currentIndex: 700001 });
    service.incrementCurrentIndex = jest.fn().mockResolvedValue({ currentIndex: 20003 });
    service.deleteDraft = jest.fn().mockResolvedValue(undefined);
    service.saveDocInfo = jest.fn().mockResolvedValue({ id: 72 });
    service.saveLinesInfo = jest.fn().mockResolvedValue(undefined);
    service.savePaymentsInfo = jest.fn().mockResolvedValue(undefined);

    const payload = {
      docData: {
        issuerBusinessNumber: '777777715',
        docType: DocumentType.TAX_INVOICE,
        docNumber: '20002',
        docStatus: DocumentStatusType.PENDING_ALLOCATION,
        allocationNum: null,
      },
      linesData: [],
      paymentData: [],
    };

    await expect(service.createDoc(payload, 'owner')).resolves.toEqual(
      expect.objectContaining({ docNumber: '20002' }),
    );

    expect(service.deleteDraft).toHaveBeenCalledWith(
      'owner',
      '777777715',
      DocumentType.TAX_INVOICE,
      manager,
      false,
    );
    expect(service.deleteDraft.mock.invocationCallOrder[0]).toBeLessThan(
      service.saveDocInfo.mock.invocationCallOrder[0],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
