/**
 * Unit tests: ReportReviewService approve-* — supplier creation is never a
 * side effect of approving an expense (product decision, 2026-08-21).
 *
 * Context: expense approval used to default `saveAsSupplier` to `true`
 * (either from `overrides.saveAsSupplier ?? true`, or the row itself
 * always sending `true`), silently writing every "ספק חדש" row into the
 * Supplier master table on approve regardless of whether the user ever
 * opened the supplier bookmark dialog. Fixed by hardcoding `false` at
 * every ExpensesService.addExpense call site in approveMatched/
 * approveDocCash/approveTxNoDoc — the ONLY way a Supplier row gets
 * created/updated is now the explicit bookmark dialog
 * (ExpensesController's add-supplier/update-supplier).
 *
 * Uses the same `Object.create(ReportReviewService.prototype)` pattern as
 * report-review-classification.spec.ts's fakeThis, extended here to
 * exercise the real private helpers (loadMatchedPair/loadTxPair/
 * assertDocOwnership/buildExpenseAmountFromDoc/absIls — all resolve via
 * the real prototype chain) while mocking only the injected repos/services.
 */
import { ReportReviewService } from './report-review.service';
import { ExtractedDocStatus } from '../documents/extracted-document.entity';
import { DocumentKind } from '../enum';

const FIREBASE_ID = 'client-1';
const BUSINESS_NUMBER = '123456789';

function makeFakeManager() {
  const repo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
  return { getRepository: jest.fn().mockReturnValue(repo) };
}

function makeService(addExpenseResult: any = { id: 999 }) {
  const svc: any = Object.create(ReportReviewService.prototype);
  svc.logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
  svc.docRepo = { findOne: jest.fn() };
  svc.slimRepo = { findOne: jest.fn() };
  svc.cacheRepo = { findOne: jest.fn() };
  svc.userRepo = { findOne: jest.fn().mockResolvedValue({ index: 42 }) };
  svc.businessRepo = { findOne: jest.fn().mockResolvedValue({ businessType: 'LICENSED', vatReportingType: 'MONTHLY_REPORT' }) };
  svc.expensesService = { addExpense: jest.fn().mockResolvedValue(addExpenseResult) };
  svc.sharedService = { buildReportPeriodLabel: jest.fn().mockReturnValue('1/2026') };
  svc.dataSource = { transaction: jest.fn((cb: any) => cb(makeFakeManager())) };
  return svc;
}

const baseDoc = {
  id: 1,
  status: ExtractedDocStatus.PENDING_REVIEW,
  businessNumber: BUSINESS_NUMBER,
  userId: 42,
  documentKind: DocumentKind.EXPENSE_INVOICE,
  matchedTransactionId: 5,
  pairedWithDocumentId: null,
  category: 'רכב ותחבורה',
  subCategory: 'דלק',
  vatPercent: 17,
  taxPercent: 45,
  supplier: 'דלק בע"מ',
  supplierId: '12345',
  invoiceNumber: 'INV-1',
  amount: 100,
  currency: 'ILS',
  date: '2026-01-05',
};

const baseSlim = {
  id: 5,
  businessNumber: BUSINESS_NUMBER,
  userId: 42,
  confirmed: false,
  externalTransactionId: 'ext-1',
  category: 'רכב ותחבורה',
  subCategory: 'דלק',
  vatPercent: 17,
  taxPercent: 45,
  subCategoryId: 10,
  reductionPercent: 0,
};

const baseCache = {
  userId: 42,
  externalTransactionId: 'ext-1',
  ilsAmount: 100,
  amount: 100,
  transactionDate: '2026-01-05',
  merchantName: 'דלק בע"מ',
};

describe('ReportReviewService — approval never auto-creates a Supplier', () => {
  // The core guarantee: even if a caller still sends a legacy
  // `saveAsSupplier: true` in overrides (stale frontend build, direct API
  // call, etc.), it's ignored — the value is a hardcoded literal, not read
  // from the input at all.
  const rogueOverrides = { saveAsSupplier: true } as any;

  it('approveMatched: addExpense is always called with saveAsSupplier=false', async () => {
    const svc = makeService();
    svc.docRepo.findOne.mockResolvedValue({ ...baseDoc });
    svc.slimRepo.findOne.mockResolvedValue({ ...baseSlim });
    svc.cacheRepo.findOne.mockResolvedValue({ ...baseCache });

    await svc.approveMatched(FIREBASE_ID, BUSINESS_NUMBER, 1, 5, rogueOverrides);

    expect(svc.expensesService.addExpense).toHaveBeenCalledTimes(1);
    const call = svc.expensesService.addExpense.mock.calls[0];
    expect(call[3]).toBe(false); // (dto, firebaseId, businessNumber, saveAsSupplier, ...)
  });

  it('approveDocCash: addExpense is always called with saveAsSupplier=false', async () => {
    const svc = makeService();
    svc.docRepo.findOne.mockResolvedValue({ ...baseDoc, matchedTransactionId: null });

    await svc.approveDocCash(FIREBASE_ID, BUSINESS_NUMBER, 1, rogueOverrides);

    expect(svc.expensesService.addExpense).toHaveBeenCalledTimes(1);
    const call = svc.expensesService.addExpense.mock.calls[0];
    expect(call[3]).toBe(false);
  });

  it('approveTxNoDoc: addExpense is always called with saveAsSupplier=false', async () => {
    const svc = makeService();
    svc.slimRepo.findOne.mockResolvedValue({ ...baseSlim });
    svc.cacheRepo.findOne.mockResolvedValue({ ...baseCache });

    await svc.approveTxNoDoc(FIREBASE_ID, BUSINESS_NUMBER, 5, rogueOverrides);

    expect(svc.expensesService.addExpense).toHaveBeenCalledTimes(1);
    const call = svc.expensesService.addExpense.mock.calls[0];
    expect(call[3]).toBe(false);
  });

  it('approveMatched: still false with no overrides at all (the default/common case)', async () => {
    const svc = makeService();
    svc.docRepo.findOne.mockResolvedValue({ ...baseDoc });
    svc.slimRepo.findOne.mockResolvedValue({ ...baseSlim });
    svc.cacheRepo.findOne.mockResolvedValue({ ...baseCache });

    await svc.approveMatched(FIREBASE_ID, BUSINESS_NUMBER, 1, 5);

    const call = svc.expensesService.addExpense.mock.calls[0];
    expect(call[3]).toBe(false);
  });
});
