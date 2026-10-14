import { signal } from '@angular/core';
import { IRowDataTable } from 'src/app/shared/interface';
import { IncomesPage } from 'src/app/pages/book-keeping/incomes/incomes.page';
import { ExpensesPage } from 'src/app/pages/book-keeping/expenses/expenses.page';
import { ArchivedDocumentsPage } from 'src/app/pages/book-keeping/archived-documents/archived-documents.page';
import { ClientsPage } from 'src/app/pages/book-keeping/clients/clients.page';
import { SuppliersPage } from 'src/app/pages/book-keeping/suppliers/suppliers.page';
import { VatReportJournalPage } from 'src/app/pages/vat-report-journal/vat-report-journal.page';
import { DocumentType } from 'src/app/pages/doc-create/doc-cerate.enum';
import { IGenericTableAction, resolveTableActions } from './table-actions';

/** Exercise the real consumer predicates/metadata without booting services or making requests. */
describe('Migrated page action contracts', () => {
  const context = { fileEditingEnabled: true, fileAttachmentEnabled: false, filesAttached: new Map<number, File>() };
  function pageActions(type: any, fields: Record<string, any> = {}): IGenericTableAction[] {
    const page = Object.assign(Object.create(type.prototype), { fileActions: signal([]) }, fields);
    page.setFileActions();
    return typeof page.fileActions === 'function' ? page.fileActions() : page.fileActions;
  }
  const names = (actions: IGenericTableAction[], row: IRowDataTable, config = context) =>
    resolveTableActions(actions, row, config, () => {}).map(action => action.name);

  it('keeps both allocation actions on pending tax invoices without a file', () => {
    const resume = jasmine.createSpy('resume SHAAM allocation');
    const actions = pageActions(IncomesPage, { resumeAutomaticAllocation: resume });
    const row = { id: 1, docTypeOriginal: DocumentType.TAX_INVOICE, docStatusOriginal: 'PENDING_ALLOCATION' };
    expect(names(actions, row))
      .toEqual(['get-allocation-from-tax', 'finalize-no-allocation']);
    const allocation = actions.find(action => action.name === 'get-allocation-from-tax');
    expect(allocation.icon).toBe('pi pi-refresh');
    allocation.action(null, row);
    expect(resume).toHaveBeenCalledOnceWith(row);
  });
  it('retains document action order and hides the opposite action for raw CLOSE status', () => {
    const actions = pageActions(IncomesPage);
    const row = { id: 1, docTypeOriginal: DocumentType.TAX_INVOICE, docDate: '2024-01-01', sumAftDisBefVAT: 100,
      docStatus: 'סגור', docStatusOriginal: 'CLOSE', file: 'file.pdf' };
    expect(names(actions, row)).toEqual(['preview', 'download', 'cancel']);
    expect(names(actions, { ...row, docStatusOriginal: 'OPEN' })).toEqual(['preview', 'download', 'cancel', 'close']);
    expect(names(actions, { ...row, file: '' })).toEqual([]);
  });
  it('does not expose allocation actions on non-tax documents', () => {
    expect(names(pageActions(IncomesPage), { id: 1, docTypeOriginal: DocumentType.RECEIPT, docStatusOriginal: 'PENDING_ALLOCATION' }))
      .toEqual([]);
  });
  it('keeps current main policy: issued invoices do not resume pending allocation', () => {
    const row = { id: 1, docTypeOriginal: DocumentType.TAX_INVOICE, docStatusOriginal: 'OPEN', docDate: '2026-10-14', sumAftDisBefVAT: 100000 };
    const actions = pageActions(IncomesPage);
    expect(names(actions, row)).toEqual([]);
    expect(names(actions, { ...row, allocationNum: '123456789' })).toEqual([]);
  });
  it('preserves expense permissions with manual files, Drive files and no files', () => {
    const actions = pageActions(ExpensesPage);
    expect(names(actions, { id: 1, canManageExpenses: true })).toEqual(['edit', 'delete', 'addFile']);
    expect(names(actions, { id: 1, canManageExpenses: true, file: 'file' })).toEqual(['edit', 'delete', 'preview']);
    expect(names(actions, { id: 1, canManageExpenses: false, sourceDocumentId: 42 })).toEqual(['preview']);
    expect(names(actions, { id: 1, canManageExpenses: false })).toEqual([]);
  });
  it('applies archive predicates to pending expenses and transaction rows', () => {
    const actions = pageActions(ArchivedDocumentsPage);
    expect(names(actions, { id: 1, itemType: 'EXPENSE', status: 'PENDING', canResolve: true, canManageExpenses: true }))
      .toEqual(['approve-expense', 'edit-pending-expense']);
    expect(names(actions, { id: 1, itemType: 'TRANSACTION', canResolve: true })).toEqual(['approve-expense']);
    expect(names(actions, { id: 1, itemType: 'EXPENSE', status: 'PENDING', canResolve: false, canManageExpenses: false })).toEqual([]);
  });
  it('distinguishes approved, deleted and annual archive documents', () => {
    const actions = pageActions(ArchivedDocumentsPage);
    const row = { id: 1, itemType: 'DOCUMENT', driveFileId: 'drive', canManageExpenses: true };
    expect(names(actions, { ...row, status: 'APPROVED' })).toEqual(['preview']);
    expect(names(actions, { ...row, status: 'DELETED' })).toEqual(['preview', 'restore']);
    expect(names(actions, { ...row, status: 'PENDING', canResolve: true, canReclassify: true }))
      .toEqual(['approve-expense', 'reclassify-document', 'preview', 'delete']);
    expect(names(actions, { ...row, status: 'PENDING', canResolve: true, documentKind: 'ANNUAL_DOCUMENT' }))
      .toEqual(['preview', 'delete']);
  });
  for (const type of [ClientsPage, SuppliersPage]) {
    it('keeps ' + type.name + ' edit/delete independent of file presence', () => {
      expect(names(pageActions(type), { id: 1 })).toEqual(['edit', 'delete']);
    });
  }
  it('preserves VAT manual replacement/delete, Drive read-only handling and attachment fallback', () => {
    const actions = pageActions(VatReportJournalPage, { canManageExpenses: () => true });
    expect(names(actions, { id: 1, file: 'file' })).toEqual(['preview', 'download', 'edit', 'delete']);
    expect(actions.find(a => a.name === 'edit').execution).toBe('fileInput');
    expect(names(actions, { id: 1, sourceDocumentId: 42 })).toEqual(['preview', 'download']);
    expect(names(actions, { id: 1 }, { ...context, fileAttachmentEnabled: true })).toEqual(['__attach-file']);
    const readOnly = pageActions(VatReportJournalPage, { canManageExpenses: () => false });
    expect(names(readOnly, { id: 1, file: 'file' }, { ...context, fileEditingEnabled: false })).toEqual(['preview', 'download']);
  });

  it('does not let a canceled VAT replacement listener upload to an older row', () => {
    const upload = jasmine.createSpy('upload');
    const page = Object.assign(Object.create(VatReportJournalPage.prototype), {
      canManageExpenses: () => true,
      confirmationService: { confirm: (options: any) => options.accept() },
      addFileToExpense: upload,
    });
    page.setFileActions();
    const replace = page.fileActions.find((action: IGenericTableAction) => action.name === 'edit');
    const input = document.createElement('input');
    input.type = 'file';
    spyOn(input, 'click');
    replace.action(input, { id: 1, file: 'old' });
    input.dispatchEvent(new Event('cancel'));
    const nextRow = { id: 2, file: 'other' };
    replace.action(input, nextRow);
    const file = new File(['pdf'], 'replacement.pdf');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    expect(upload).toHaveBeenCalledOnceWith({ row: nextRow, file });
  });
});
