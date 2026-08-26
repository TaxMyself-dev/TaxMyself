/**
 * P&L preparation materializes missing depreciation postings before reading
 * the report. That accounting side effect belongs to the accountant's
 * mandatory EXPENSES_APPROVE authority, not the document-issuance
 * DOCUMENTS_WRITE scope. The on-screen report and PDF export share it.
 */
import { REQUIRED_DELEGATION_SCOPE_KEY } from '../decorators/required-delegation-scope.decorator';
import { DelegationScope } from '../delegation/delegation.entity';
import { ReportsController } from './reports.controller';

describe('ReportsController — P&L preparation scopes', () => {
  const controller = new ReportsController({} as any, {} as any, {} as any, {} as any);

  it.each([
    ['preparePnLReportFromJournal', controller.preparePnLReportFromJournal],
    ['getPnlReportPdf', controller.getPnlReportPdf],
  ])('%s requires EXPENSES_APPROVE instead of DOCUMENTS_WRITE', (_name, handler) => {
    const scope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, handler);
    expect(scope).toBe(DelegationScope.EXPENSES_APPROVE);
  });
});
