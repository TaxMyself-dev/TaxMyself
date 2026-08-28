import { HttpException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { DocumentsService } from './documents.service';
import { ExtractedDocument, ExtractedDocStatus } from './extracted-document.entity';
import { Expense } from '../expenses/expenses.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { ArchiveItemStatus, DocumentArchiveStatus } from '../enum';

describe('DocumentsService.deleteArchivedDocument', () => {
  function subject(options: {
    user?: any;
    selected?: any;
    rows?: any[];
  } = {}) {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue(options.user ?? { index: 7 }),
    };
    const extractedDocRepo = {
      findOne: jest.fn().mockResolvedValue(options.selected ?? {
        id: 10,
        userId: 7,
        driveFileId: 'drive-1',
      }),
      find: jest.fn().mockResolvedValue(options.rows ?? [
        { id: 10, userId: 7, driveFileId: 'drive-1' },
        { id: 11, userId: 7, driveFileId: 'drive-1' },
      ]),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const expenseRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const slimRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const transactionalDocRepo = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Expense) return expenseRepo;
        if (entity === SlimTransaction) return slimRepo;
        if (entity === ExtractedDocument) return transactionalDocRepo;
        throw new Error(`Unexpected repository`);
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (run) => run(manager)),
    };
    const googleDriveService = {
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    const fakeThis = {
      userRepo,
      extractedDocRepo,
      dataSource,
      googleDriveService,
    };

    return {
      userRepo,
      extractedDocRepo,
      expenseRepo,
      slimRepo,
      transactionalDocRepo,
      dataSource,
      googleDriveService,
      run: () => DocumentsService.prototype.deleteArchivedDocument.call(
        fakeThis as any,
        'client-1',
        10,
      ),
    };
  }

  it('soft-deletes every OCR row that shares the file without deleting Drive or accounting data', async () => {
    const test = subject();

    await expect(test.run()).resolves.toEqual({
      ok: true,
      documentId: 10,
      deletedDocumentRows: 2,
    });
    expect(test.extractedDocRepo.update).toHaveBeenCalledWith(
      { id: In([10, 11]) },
      { status: ExtractedDocStatus.DELETED },
    );
    expect(test.googleDriveService.deleteFile).not.toHaveBeenCalled();
    expect(test.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('maps the persisted deleted state to the archive deleted filter status', () => {
    const archiveStatus = (DocumentsService.prototype as any).deriveArchiveStatus.call(
      {},
      { status: ExtractedDocStatus.DELETED, confirmedExpenseId: null },
      new Map(),
    );
    const displayStatus = (DocumentsService.prototype as any).simplifyDocStatus.call(
      {},
      archiveStatus,
    );

    expect(archiveStatus).toBe(DocumentArchiveStatus.DELETED);
    expect(displayStatus).toBe(ArchiveItemStatus.DELETED);
  });

  it('does not allow deleting another user’s archived file', async () => {
    const test = subject({
      selected: { id: 10, userId: 99, driveFileId: 'drive-1' },
    });

    await expect(test.run()).rejects.toBeInstanceOf(HttpException);
    expect(test.googleDriveService.deleteFile).not.toHaveBeenCalled();
    expect(test.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses a Drive file that is also referenced by another user', async () => {
    const test = subject({
      rows: [
        { id: 10, userId: 7, driveFileId: 'drive-1' },
        { id: 11, userId: 99, driveFileId: 'drive-1' },
      ],
    });

    await expect(test.run()).rejects.toBeInstanceOf(HttpException);
    expect(test.googleDriveService.deleteFile).not.toHaveBeenCalled();
    expect(test.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('returns not found without touching Drive when the document does not exist', async () => {
    const test = subject({ selected: null });
    test.extractedDocRepo.findOne.mockResolvedValueOnce(null);

    await expect(test.run()).rejects.toBeInstanceOf(NotFoundException);
    expect(test.googleDriveService.deleteFile).not.toHaveBeenCalled();
  });
});
