/**
 * Unit tests: BookkeepingService — createJournalEntry / persistJournalEntry
 *
 * Covers:
 *  - createJournalEntry: uses the given manager directly (no new transaction)
 *  - createJournalEntry: opens dataSource.transaction() when no manager given
 *  - createJournalEntry: logs + re-throws on failure
 *  - persistJournalEntry: resolves all account codes BEFORE any write (fail-fast)
 *  - persistJournalEntry: assigns entryNumber via getJournalEntryCurrentIndex
 *  - persistJournalEntry: saves header with correct fields
 *  - persistJournalEntry: saves lines linked to the generated journalEntry.id
 *  - persistJournalEntry: increments the running index only AFTER a successful save
 *  - persistJournalEntry: defaults optional line fields
 *  - persistJournalEntry: returns { entryNumber, id }
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { BookkeepingService } from './bookkeeping.service';
import { JournalEntry } from './jouranl-entry.entity';
import { JournalLine } from './jouranl-line.entity';
import { DefaultBookingAccount } from './account.entity';
import { SharedService } from '../shared/shared.service';
import { JournalReferenceType } from '../enum';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeRepo<T>(partial: Partial<Repository<T>> = {}): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn((dto) => dto),
    update: jest.fn().mockResolvedValue(undefined),
    ...partial,
  } as any;
}

function makeInput(overrides: Partial<any> = {}) {
  return {
    firebaseId: 'firebase-uid-1',
    issuerBusinessNumber: '999999999',
    subCategory: null,
    counterAccountCode: '1200',
    counterPartyName: 'לקוח לדוגמה',
    documentTotal: 117,
    date: '2024-01-15',
    valueDate: '2024-01-15',
    vatDate: '2024-01-15',
    vatReportingPeriod: '1/2024',
    referenceType: JournalReferenceType.EXPENSE,
    referenceId: 1,
    description: 'test entry',
    lines: [
      { accountCode: '1200', debit: 117 },
      { accountCode: '4000', credit: 100, amountBeforeVat: 100, taxPercent: 100, vatPercent: 100, amountForTax: 100 },
      { accountCode: '2400', credit: 17, vatAmount: 17, vatPercent: 100 },
    ],
    ...overrides,
  };
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe('BookkeepingService — createJournalEntry / persistJournalEntry', () => {
  let service: BookkeepingService;
  let dataSource: jest.Mocked<DataSource>;
  let sharedService: jest.Mocked<Partial<SharedService>>;
  let journalEntryRepo: jest.Mocked<Repository<JournalEntry>>;
  let journalLineRepo: jest.Mocked<Repository<JournalLine>>;
  let bookingAccountRepo: jest.Mocked<Repository<DefaultBookingAccount>>;
  let mockManager: jest.Mocked<EntityManager>;

  beforeEach(async () => {
    journalEntryRepo = makeRepo<JournalEntry>({
      save: jest.fn().mockImplementation((e) => Promise.resolve({ ...e, id: 555 })),
    });
    journalLineRepo = makeRepo<JournalLine>({
      save: jest.fn().mockResolvedValue(undefined),
    });
    bookingAccountRepo = makeRepo<DefaultBookingAccount>({
      findOneByOrFail: jest.fn().mockImplementation(({ code }: { code: string }) =>
        Promise.resolve({ code }),
      ),
    });

    const reposByEntity = new Map<any, any>([
      [JournalEntry, journalEntryRepo],
      [JournalLine, journalLineRepo],
      [DefaultBookingAccount, bookingAccountRepo],
    ]);

    mockManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => reposByEntity.get(entity)),
    } as any;

    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: EntityManager) => Promise<any>) => cb(mockManager)),
    } as any;

    sharedService = {
      getJournalEntryCurrentIndex: jest.fn().mockResolvedValue(10000001),
      incrementJournalEntryIndex: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookkeepingService,
        { provide: getRepositoryToken(JournalEntry), useValue: journalEntryRepo },
        { provide: getRepositoryToken(JournalLine), useValue: journalLineRepo },
        { provide: getRepositoryToken(DefaultBookingAccount), useValue: bookingAccountRepo },
        { provide: SharedService, useValue: sharedService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<BookkeepingService>(BookkeepingService);
  });

  afterEach(() => jest.restoreAllMocks());

  // ── transaction handling ───────────────────────────────────────────────────

  describe('transaction handling', () => {
    it('uses the given manager directly without opening a new transaction', async () => {
      await service.createJournalEntry(makeInput(), mockManager);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.getRepository).toHaveBeenCalled();
    });

    it('opens dataSource.transaction() when no manager is provided', async () => {
      await service.createJournalEntry(makeInput());
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('logs and re-throws when persistJournalEntry fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      bookingAccountRepo.findOneByOrFail.mockRejectedValueOnce(new Error('account not found'));

      const input = makeInput({
        issuerBusinessNumber: '111111111',
        referenceType: JournalReferenceType.EXPENSE,
        referenceId: 42,
      });

      await expect(service.createJournalEntry(input, mockManager)).rejects.toThrow('account not found');
      expect(consoleSpy).toHaveBeenCalledWith(
        '❌ Failed to create journal entry:',
        expect.objectContaining({
          issuerBusinessNumber: '111111111',
          referenceType: JournalReferenceType.EXPENSE,
          referenceId: 42,
        }),
      );
    });
  });

  // ── account code resolution ────────────────────────────────────────────────

  describe('account code resolution (fail-fast)', () => {
    it('resolves every line account code before writing anything', async () => {
      await service.createJournalEntry(makeInput(), mockManager);
      expect(bookingAccountRepo.findOneByOrFail).toHaveBeenCalledTimes(3);
      expect(bookingAccountRepo.findOneByOrFail).toHaveBeenCalledWith({ code: '1200' });
      expect(bookingAccountRepo.findOneByOrFail).toHaveBeenCalledWith({ code: '4000' });
      expect(bookingAccountRepo.findOneByOrFail).toHaveBeenCalledWith({ code: '2400' });
    });

    it('does not save the header or lines when an account code is unknown', async () => {
      bookingAccountRepo.findOneByOrFail.mockRejectedValueOnce(new Error('not found: 9999'));
      const input = makeInput({ lines: [{ accountCode: '9999', debit: 100 }] });

      await expect(service.createJournalEntry(input, mockManager)).rejects.toThrow();
      expect(journalEntryRepo.save).not.toHaveBeenCalled();
      expect(journalLineRepo.save).not.toHaveBeenCalled();
      expect(sharedService.incrementJournalEntryIndex).not.toHaveBeenCalled();
    });
  });

  // ── entry numbering ────────────────────────────────────────────────────────

  describe('entry numbering', () => {
    it('assigns entryNumber via sharedService.getJournalEntryCurrentIndex', async () => {
      (sharedService.getJournalEntryCurrentIndex as jest.Mock).mockResolvedValueOnce(10000042);
      const result = await service.createJournalEntry(makeInput(), mockManager);
      expect(result.entryNumber).toBe(10000042);
      expect(sharedService.getJournalEntryCurrentIndex).toHaveBeenCalledWith('999999999', mockManager);
    });

    it('increments the running index only AFTER a successful save', async () => {
      const callOrder: string[] = [];
      journalEntryRepo.save.mockImplementation((e: any) => {
        callOrder.push('save-header');
        return Promise.resolve({ ...e, id: 555 });
      });
      journalLineRepo.save.mockImplementation((l: any) => {
        callOrder.push('save-lines');
        return Promise.resolve(l);
      });
      (sharedService.incrementJournalEntryIndex as jest.Mock).mockImplementation(() => {
        callOrder.push('increment-index');
        return Promise.resolve(undefined);
      });

      await service.createJournalEntry(makeInput(), mockManager);
      expect(callOrder).toEqual(['save-header', 'save-lines', 'increment-index']);
    });

    it('does not increment the index if the header save fails', async () => {
      journalEntryRepo.save.mockRejectedValueOnce(new Error('db down'));
      await expect(service.createJournalEntry(makeInput(), mockManager)).rejects.toThrow('db down');
      expect(sharedService.incrementJournalEntryIndex).not.toHaveBeenCalled();
    });
  });

  // ── header persistence ─────────────────────────────────────────────────────

  describe('header persistence', () => {
    it('saves the header with the correct fields', async () => {
      const input = makeInput({ counterPartyName: 'ספק לדוגמה', documentTotal: 117, vatReportingPeriod: '3/2024' });
      await service.createJournalEntry(input, mockManager);

      expect(journalEntryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          firebaseId: 'firebase-uid-1',
          issuerBusinessNumber: '999999999',
          counterAccountCode: '1200',
          counterPartyName: 'ספק לדוגמה',
          documentTotal: 117,
          vatReportingPeriod: '3/2024',
          entryNumber: 10000001,
        }),
      );
    });
  });

  // ── line persistence ───────────────────────────────────────────────────────

  describe('line persistence', () => {
    it('saves lines linked to the generated journalEntry.id, in order', async () => {
      journalEntryRepo.save.mockResolvedValueOnce({ id: 777 } as any);
      await service.createJournalEntry(makeInput(), mockManager);

      expect(journalLineRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ accountCode: '1200', journalEntryId: 777, lineInEntry: 1, debit: 117, credit: 0 }),
        expect.objectContaining({ accountCode: '4000', journalEntryId: 777, lineInEntry: 2, credit: 100 }),
        expect.objectContaining({ accountCode: '2400', journalEntryId: 777, lineInEntry: 3, credit: 17 }),
      ]);
    });

    it('defaults optional line fields when not provided', async () => {
      const input = makeInput({ lines: [{ accountCode: '1200', debit: 117 }] });
      await service.createJournalEntry(input, mockManager);

      expect(journalLineRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          debit: 117,
          credit: 0,
          amountBeforeVat: 0,
          vatAmount: 0,
          isEquipment: false,
          taxPercent: 100,
          vatPercent: 100,
          amountForTax: 0,
          subCategoryName: null,
        }),
      ]);
    });
  });

  // ── return value ───────────────────────────────────────────────────────────

  describe('return value', () => {
    it('returns { entryNumber, id }', async () => {
      journalEntryRepo.save.mockResolvedValueOnce({ id: 321 } as any);
      (sharedService.getJournalEntryCurrentIndex as jest.Mock).mockResolvedValueOnce(10000099);

      const result = await service.createJournalEntry(makeInput(), mockManager);
      expect(result).toEqual({ entryNumber: 10000099, id: 321 });
    });
  });
});
