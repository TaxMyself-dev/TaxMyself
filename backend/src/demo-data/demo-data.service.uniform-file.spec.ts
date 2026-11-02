import { Business } from 'src/business/business.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { Documents } from 'src/documents/documents.entity';
import { DocLines } from 'src/documents/doc-lines.entity';
import { DocPayments } from 'src/documents/doc-payments.entity';
import { DocumentType } from 'src/enum';
import { Expense } from 'src/expenses/expenses.entity';
import { User } from 'src/users/user.entity';
import { DemoDataService } from './demo-data.service';
import { DemoProfile } from './demo-profile.types';
import { LEDGER_TEST_PROFILE } from './profiles/ledger-test.profile';

function createFixtureHarness() {
  const service: any = Object.create(DemoDataService.prototype);
  service.documentsService = { createDoc: jest.fn().mockResolvedValue({}) };
  service.expensesService = { addExpense: jest.fn().mockResolvedValue({}) };
  service.warnIfChartOfAccountsMissing = jest.fn().mockResolvedValue(undefined);
  service.assertUniformFileFixtureComplete = jest.fn().mockResolvedValue(undefined);
  service.logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return service;
}

describe('ledger-test uniform-file fixture', () => {
  afterEach(() => jest.restoreAllMocks());

  it('declares a cut with opening-period and in-period source data', () => {
    const scenario = LEDGER_TEST_PROFILE.uniformFileScenario!;
    const relevantDocuments = LEDGER_TEST_PROFILE.documents!
      .filter((document) => document.businessNumberRef === scenario.businessNumberRef);
    const relevantExpenses = LEDGER_TEST_PROFILE.expenses!
      .filter((expense) => expense.businessNumberRef === scenario.businessNumberRef);

    expect(scenario).toEqual({
      businessNumberRef: '222222226',
      startDate: '2026-02-01',
      endDate: '2026-03-31',
    });
    expect([
      ...relevantDocuments.map((document) => document.docDate),
      ...relevantExpenses.map((expense) => expense.expenseDate),
    ].some((date) => date < scenario.startDate)).toBe(true);
    expect(relevantDocuments.some((document) =>
      document.docDate >= scenario.startDate
      && document.docDate <= scenario.endDate
      && (document.lines?.length ?? 0) > 0
      && (document.payments?.length ?? 0) > 0
      && (document.discountSum ?? 0) > 0,
    )).toBe(true);
    const inPeriodDocuments = relevantDocuments.filter((document) =>
      document.docDate >= scenario.startDate && document.docDate <= scenario.endDate,
    );
    const typesRequiringLines = new Set([
      DocumentType.WORK_ORDER,
      DocumentType.TRANSACTION_INVOICE,
      DocumentType.TAX_INVOICE,
      DocumentType.TAX_INVOICE_RECEIPT,
      DocumentType.CREDIT_INVOICE,
    ]);
    const typesRequiringPayments = new Set([
      DocumentType.TAX_INVOICE_RECEIPT,
      DocumentType.RECEIPT,
    ]);
    for (const document of inPeriodDocuments) {
      if (typesRequiringLines.has(document.docType)) {
        expect(document.lines?.length ?? 0).toBeGreaterThan(0);
        expect(document.lines!.reduce(
          (sum, line) => sum + line.sumAftDisBefVatPerLine + Math.abs(line.discount ?? 0), 0,
        )).toBe(document.sumBefDisBefVat ?? document.sumAftDisBefVAT);
      }
      if (typesRequiringPayments.has(document.docType)) {
        expect(document.payments?.length ?? 0).toBeGreaterThan(0);
        expect(document.payments!.reduce((sum, payment) => sum + payment.paymentAmount, 0))
          .toBe(document.sumAftDisBefVAT + document.vatSum);
      }
    }
    const hasValidIsraeliCheckDigit = (value: string) => value
      .split('')
      .map(Number)
      .reduce((sum, digit, index) => {
        const product = digit * (index % 2 === 0 ? 1 : 2);
        return sum + (product > 9 ? product - 9 : product);
      }, 0) % 10 === 0;
    expect(hasValidIsraeliCheckDigit(scenario.businessNumberRef)).toBe(true);
    for (const recipientId of relevantDocuments
      .map((document) => document.recipientId)
      .filter((value): value is string => !!value)) {
      expect(hasValidIsraeliCheckDigit(recipientId)).toBe(true);
    }
  });

  it('passes real lines, payments, and discount totals through createDoc', async () => {
    const service = createFixtureHarness();

    await service.seedDocumentsAndExpenses('demo-firebase-id', LEDGER_TEST_PROFILE);

    const call = service.documentsService.createDoc.mock.calls.find(
      ([payload]: any[]) => payload.docData.docDate === '2026-02-15'
        && payload.docData.issuerBusinessNumber === '222222226',
    );
    expect(call).toBeDefined();
    expect(call[0].docData).toEqual(expect.objectContaining({
      sumBefDisBefVat: 5500,
      disSum: 500,
      sumAftDisBefVAT: 5000,
      vatSum: 900,
      sumAftDisWithVAT: 5900,
    }));
    expect(call[0].linesData).toEqual([
      expect.objectContaining({
        lineNumber: '1',
        description: 'חבילת אימון עסקית',
        disBefVatPerLine: 500,
        sumAftDisBefVatPerLine: 5000,
        vatPerLine: 900,
      }),
    ]);
    expect(call[0].paymentData).toEqual([
      expect.objectContaining({
        paymentLineNumber: '1',
        paymentDate: '2026-02-15',
        paymentAmount: 5900,
      }),
    ]);
  });

  it('fails a strict uniform-file fixture when a source document cannot be created', async () => {
    const service = createFixtureHarness();
    service.documentsService.createDoc.mockRejectedValueOnce(new Error('document failed'));
    const profile: DemoProfile = {
      ...LEDGER_TEST_PROFILE,
      documents: LEDGER_TEST_PROFILE.documents!.slice(0, 2),
      expenses: [],
    };

    await expect(service.seedDocumentsAndExpenses('demo-firebase-id', profile))
      .rejects.toThrow('document failed');
    expect(service.documentsService.createDoc).toHaveBeenCalledTimes(2);
  });

  it('creates strict-fixture expenses sequentially to avoid journal-counter deadlocks', async () => {
    const service = createFixtureHarness();
    let activeExpenseCalls = 0;
    let maxActiveExpenseCalls = 0;
    service.expensesService.addExpense.mockImplementation(async () => {
      activeExpenseCalls += 1;
      maxActiveExpenseCalls = Math.max(maxActiveExpenseCalls, activeExpenseCalls);
      await new Promise((resolve) => setImmediate(resolve));
      activeExpenseCalls -= 1;
    });
    const runConcurrently = jest.fn(async (
      items: unknown[],
      concurrency: number,
      worker: (item: unknown) => Promise<void>,
    ) => {
      for (const item of items) await worker(item);
    });
    service.runConcurrently = runConcurrently;

    await service.seedDocumentsAndExpenses('demo-firebase-id', LEDGER_TEST_PROFILE);

    expect(runConcurrently).toHaveBeenCalled();
    for (const [, concurrency] of runConcurrently.mock.calls) {
      expect(concurrency).toBe(1);
    }
    expect(maxActiveExpenseCalls).toBe(1);
  });

  it('verifies persisted source and journal counts for the strict fixture', async () => {
    const service = createFixtureHarness();
    delete service.assertUniformFileFixtureComplete;
    const expected = {
      [Documents.name]: LEDGER_TEST_PROFILE.documents!.length,
      [DocLines.name]: LEDGER_TEST_PROFILE.documents!
        .reduce((sum, document) => sum + (document.lines?.length ?? 0), 0),
      [DocPayments.name]: LEDGER_TEST_PROFILE.documents!
        .reduce((sum, document) => sum + (document.payments?.length ?? 0), 0),
      [Expense.name]: LEDGER_TEST_PROFILE.expenses!.length,
      [JournalEntry.name]: LEDGER_TEST_PROFILE.documents!.length
        + LEDGER_TEST_PROFILE.expenses!.length,
    };
    service.dataSource = {
      getRepository: jest.fn((entity: { name: string }) => ({
        count: jest.fn().mockResolvedValue(expected[entity.name]),
      })),
    };

    await expect(service.assertUniformFileFixtureComplete(
      'demo-firebase-id',
      LEDGER_TEST_PROFILE,
    )).resolves.toBeUndefined();

    expected[JournalEntry.name] -= 1;
    await expect(service.assertUniformFileFixtureComplete(
      'demo-firebase-id',
      LEDGER_TEST_PROFILE,
    )).rejects.toThrow('verification failed');
  });

  it('self-reset clears journal rows and counters before reseeding the fixture', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = createFixtureHarness();
    const deleteMock = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      delete: deleteMock,
      insert: jest.fn().mockResolvedValue(undefined),
    };
    let resetTransactionFinished = false;
    service.dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) {
          return { findOne: jest.fn().mockResolvedValue({
            firebaseId: 'demo-firebase-id',
            email: LEDGER_TEST_PROFILE.email,
            index: 42,
          }) };
        }
        if (entity === Business) {
          return { find: jest.fn().mockResolvedValue([{
            businessNumber: '222222226',
            driveInboxFolderId: null,
            driveProcessedFolderId: null,
          }]) };
        }
        throw new Error(`Unexpected repository ${String(entity)}`);
      }),
      transaction: jest.fn(async (callback: (value: typeof manager) => Promise<void>) => {
        await callback(manager);
        resetTransactionFinished = true;
      }),
    };
    service.buildCacheRowsFromProfile = jest.fn().mockResolvedValue([]);
    service.applyProfileSourceState = jest.fn().mockResolvedValue(0);
    service.seedDocumentsAndExpenses = jest.fn().mockImplementation(async () => {
      expect(resetTransactionFinished).toBe(true);
    });

    await service.testReset('demo-firebase-id');

    expect(deleteMock).toHaveBeenCalledWith(JournalLine, { firebaseId: 'demo-firebase-id' });
    expect(deleteMock).toHaveBeenCalledWith(JournalEntry, { firebaseId: 'demo-firebase-id' });
    expect(deleteMock).toHaveBeenCalledWith(SettingDocuments, { userId: 'demo-firebase-id' });
    expect(service.seedDocumentsAndExpenses).toHaveBeenCalledWith(
      'demo-firebase-id',
      LEDGER_TEST_PROFILE,
    );
  });
});
