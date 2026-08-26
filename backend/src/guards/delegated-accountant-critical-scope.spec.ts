/**
 * Regression audit for critical accountant-on-behalf-of-client operations.
 *
 * FirebaseAuthGuard deliberately defaults every POST/PATCH/PUT/DELETE to
 * DOCUMENTS_WRITE. Each accounting operation below must therefore carry an
 * explicit scope override; otherwise an accountant who can approve expenses
 * but cannot issue documents in the client's name receives a misleading 403.
 */
import { REQUIRED_DELEGATION_SCOPE_KEY } from '../decorators/required-delegation-scope.decorator';
import { DelegationScope } from '../delegation/delegation.entity';
import { AccountantBookingAccountsController } from '../bookkeeping/accountant-booking-accounts.controller';
import { BookkepingController } from '../bookkeeping/bookkeeping.controller';
import { DocumentsController } from '../documents/documents.controller';
import { ExpensesController } from '../expenses/expenses.controller';
import { ReportsController } from '../reports/reports.controller';
import { TransactionsController } from '../transactions/transactions.controller';
import { AnnualReportController } from '../annual-report/annual-report.controller';
import { ReportWorkflowController } from '../report-workflow/report-workflow.controller';

type ScopedHandler = [name: string, handler: Function];

const EXPENSE_APPROVAL_OPERATIONS: ScopedHandler[] = [
  // Inbound evidence/OCR preparation.
  ['documents.processMyInbox', DocumentsController.prototype.processMyInbox],
  ['documents.archiveExtractedDoc', DocumentsController.prototype.archiveExtractedDoc],
  ['documents.ocrSingleFile', DocumentsController.prototype.ocrSingleFile],
  ['documents.uploadFilesToInbox', DocumentsController.prototype.uploadFilesToInbox],
  ['documents.deleteMyArchivedDocument', DocumentsController.prototype.deleteMyArchivedDocument],

  // Expense creation, classification, mapping and evidence maintenance.
  ['expenses.addExpense', ExpensesController.prototype.addExpense],
  ['expenses.bulkConfirmFromDrive', ExpensesController.prototype.bulkConfirmFromDrive],
  ['expenses.checkDuplicatesFromDrive', ExpensesController.prototype.checkDuplicatesFromDrive],
  ['expenses.reclassifyExpense', ExpensesController.prototype.reclassifyExpense],
  ['expenses.overrideExpenseMapping', ExpensesController.prototype.overrideExpenseMapping],
  ['expenses.completeExpenseMapping', ExpensesController.prototype.completeExpenseMapping],
  ['expenses.updateExpense', ExpensesController.prototype.updateExpense],
  ['expenses.addFileToExpense', ExpensesController.prototype.addFileToExpense],
  ['expenses.deleteFileFromExpense', ExpensesController.prototype.deleteFileFromExpense],
  ['expenses.addSupplier', ExpensesController.prototype.addSupplier],
  ['expenses.updateSupplier', ExpensesController.prototype.updateSupplier],

  // Client/accountant chart maintenance and manual accounting entries.
  ['bookkeeping.repointSubCategoryAccount', BookkepingController.prototype.repointSubCategoryAccount],
  ['bookkeeping.createAccount', BookkepingController.prototype.createAccount],
  ['bookkeeping.createManualJournalEntry', BookkepingController.prototype.createManualJournalEntry],
  ['bookkeeping.createManualJournalEntries', BookkepingController.prototype.createManualJournalEntries],
  ['accountantCards.update', AccountantBookingAccountsController.prototype.update],
  ['accountantCards.deactivate', AccountantBookingAccountsController.prototype.deactivate],
  ['accountantCards.activate', AccountantBookingAccountsController.prototype.activate],

  // Bank/card classification and conversion into expenses.
  ['transactions.classifyTransaction', TransactionsController.prototype.classifyTransaction],
  ['transactions.quickClassifyTransaction', TransactionsController.prototype.quickClassifyTransaction],
  ['transactions.updateTransaction', TransactionsController.prototype.updateTransaction],
  ['transactions.saveTransToExpenses', TransactionsController.prototype.saveTransToExpenses],

  // Report preparation and accountant reporting lifecycle.
  ['reports.preparePnLReportFromJournal', ReportsController.prototype.preparePnLReportFromJournal],
  ['reports.getPnlReportPdf', ReportsController.prototype.getPnlReportPdf],
  ['reports.markSubmitted', ReportsController.prototype.markSubmitted],
  ['annualReport.setReported', AnnualReportController.prototype.setReported],
  ['reportWorkflow.setReported', ReportWorkflowController.prototype.setReported],
];

describe('delegated accountant critical-scope audit', () => {
  it.each(EXPENSE_APPROVAL_OPERATIONS)(
    '%s explicitly requires EXPENSES_APPROVE',
    (_name, handler) => {
      expect(Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, handler)).toBe(
        DelegationScope.EXPENSES_APPROVE,
      );
    },
  );

  it('uniform-file export is an explicit delegated read, not document issuance', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_DELEGATION_SCOPE_KEY,
        ReportsController.prototype.getHelloWorldZip,
      ),
    ).toBe(DelegationScope.DOCUMENTS_READ);
  });

  it.each([
    ['documents.createDoc', DocumentsController.prototype.createDoc],
    ['expenses.deleteExpense', ExpensesController.prototype.deleteExpense],
    ['expenses.deleteSupplier', ExpensesController.prototype.deleteSupplier],
    ['annualReport.saveAnswers', AnnualReportController.prototype.saveAnswers],
  ] as ScopedHandler[])(
    '%s stays on the restrictive DOCUMENTS_WRITE default',
    (_name, handler) => {
      expect(Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, handler)).toBeUndefined();
    },
  );
});
