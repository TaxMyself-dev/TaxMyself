import { DocumentStatusType, DocumentType } from '../enum';
import { DocumentsService } from './documents.service';

describe('DocumentsService draft issuance', () => {
  it('excludes saved OAuth drafts from the issued-documents query', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const service = Object.create(DocumentsService.prototype) as any;
    service.businessService = {
      getBusinessByNumber: jest.fn().mockResolvedValue({ businessNumber: '777777715' }),
    };
    service.documentsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };

    await expect(service.getDocuments('777777715', 'owner')).resolves.toEqual([]);

    expect(query.andWhere).toHaveBeenCalledWith(
      'doc.docStatus != :draftStatus',
      { draftStatus: DocumentStatusType.DRAFT },
    );
  });

  it('removes the saved draft transactionally before inserting the reserved document number', async () => {
    const updateDocument = jest.fn().mockResolvedValue(undefined);
    const manager = {
      getRepository: jest.fn(() => ({ update: updateDocument })),
    };
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
    service.businessService = {
      getBusinessByNumber: jest.fn().mockResolvedValue({
        businessType: 'LICENSED',
        vatReportingType: 'MONTHLY',
      }),
    };
    service.sharedService = {
      normalizeToMySqlDate: jest.fn().mockReturnValue('2026-11-17'),
      buildReportPeriodLabel: jest.fn().mockReturnValue('11/2026'),
    };
    service.bookkeepingService = {
      createJournalEntry: jest.fn().mockResolvedValue({
        id: 81,
        entryNumber: 700081,
      }),
    };
    service.generatePdfPair = jest.fn();

    const payload = {
      docData: {
        issuerBusinessNumber: '777777715',
        docType: DocumentType.TAX_INVOICE,
        docNumber: '20002',
        docStatus: DocumentStatusType.PENDING_ALLOCATION,
        allocationNum: null,
        docDate: '2026-11-17',
        recipientName: 'Pending customer',
        sumAftDisBefVAT: 100,
        vatSum: 18,
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
    expect(service.bookkeepingService.createJournalEntry).toHaveBeenCalledTimes(1);
    expect(updateDocument).toHaveBeenCalledWith(72, {
      journalEntryNumber: 700081,
      journalEntryId: 81,
    });
    expect(service.generatePdfPair).not.toHaveBeenCalled();
  });

  it('finalizes a current pending document, closes its transaction-invoice parent, and avoids a duplicate journal entry', async () => {
    const documentRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const queryRunner = {
      manager: { getRepository: jest.fn(() => documentRepo) },
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const service = Object.create(DocumentsService.prototype) as any;
    service.documentsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 72,
        issuerBusinessNumber: '777777715',
        docNumber: '20002',
        generalDocIndex: '700001',
        docType: DocumentType.TAX_INVOICE_RECEIPT,
        docStatus: DocumentStatusType.PENDING_ALLOCATION,
        allocationNum: null,
        parentDocType: DocumentType.TRANSACTION_INVOICE,
        parentDocNumber: '40000',
        journalEntryId: 81,
        journalEntryNumber: 700081,
        docDate: '2026-11-17',
        recipientName: 'Pending customer',
        sumAftDisBefVAT: 100,
        vatSum: 18,
      }),
    };
    service.shaamAllocationAttemptRepo = { findOne: jest.fn().mockResolvedValue(null) };
    service.docLinesRepo = { find: jest.fn().mockResolvedValue([]) };
    service.docPaymentsRepo = { find: jest.fn().mockResolvedValue([]) };
    service.businessService = {
      getBusinessByNumber: jest.fn().mockResolvedValue({ businessType: 'LICENSED' }),
    };
    service.dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    service.generatePdfPair = jest.fn().mockResolvedValue({ original: Buffer.from('signed-original'), copy: Buffer.from('signed-copy') });
    service.uploadToFirebase = jest.fn()
      .mockResolvedValueOnce('original-path')
      .mockResolvedValueOnce('copy-path');
    service.deleteFromFirebase = jest.fn();
    service.bookkeepingService = { createJournalEntry: jest.fn() };

    await expect(service.finalizeAllocation('owner', {
      issuerBusinessNumber: '777777715',
      docNumber: '20002',
      docType: DocumentType.TAX_INVOICE_RECEIPT,
      allocationNum: '123456789',
    })).resolves.toEqual(expect.objectContaining({
      allocationNum: '123456789',
      file: 'original-path',
      copyFile: 'copy-path',
    }));

    expect(service.bookkeepingService.createJournalEntry).not.toHaveBeenCalled();
    expect(documentRepo.update).toHaveBeenCalledWith(
      {
        issuerBusinessNumber: '777777715',
        docType: DocumentType.TRANSACTION_INVOICE,
        docNumber: '40000',
        docStatus: DocumentStatusType.OPEN,
      },
      { docStatus: DocumentStatusType.CLOSE },
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
  it('rolls back issuance after a partial upload failure and removes the successful file', async () => {
    const runner = {
      manager: {}, connect: jest.fn(), startTransaction: jest.fn(),
      commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
    };
    const service = Object.create(DocumentsService.prototype) as any;
    service.dataSource = {createQueryRunner: () => runner};
    service.incrementGeneralIndex = jest.fn().mockResolvedValue({currentIndex: 700002});
    service.incrementCurrentIndex = jest.fn().mockResolvedValue({currentIndex: 20});
    service.deleteDraft = jest.fn();
    service.saveDocInfo = jest.fn().mockResolvedValue({id: 1});
    service.saveLinesInfo = jest.fn(); service.savePaymentsInfo = jest.fn();
    service.generatePdfPair = jest.fn().mockResolvedValue({original: Buffer.from('signed-original'), copy: Buffer.from('signed-copy')});
    service.uploadToFirebase = jest.fn().mockResolvedValueOnce('uploaded-original')
      .mockRejectedValueOnce(new Error('copy upload failed'));
    service.deleteFromFirebase = jest.fn().mockResolvedValue(undefined);
    await expect(service.createDoc({docData: {issuerBusinessNumber: 'test', docType: DocumentType.PRICE_QUOTE},
      linesData: [], paymentData: []}, 'owner')).rejects.toThrow('copy upload failed');
    expect(service.deleteFromFirebase).toHaveBeenCalledTimes(1);
    expect(service.deleteFromFirebase).toHaveBeenCalledWith('uploaded-original');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

});
