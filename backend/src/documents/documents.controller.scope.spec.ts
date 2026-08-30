/**
 * Inbound expense-document operations belong to the accountant's mandatory
 * EXPENSES_APPROVE authority. They must not fall through to the generic
 * DOCUMENTS_WRITE default, because a view-only document delegation is still
 * allowed to prepare and approve the client's expenses.
 */
import { REQUIRED_DELEGATION_SCOPE_KEY } from '../decorators/required-delegation-scope.decorator';
import { DelegationScope } from '../delegation/delegation.entity';
import { DocumentsController } from './documents.controller';

describe('DocumentsController — inbound expense-document scopes', () => {
  const controller = new DocumentsController({} as any);

  it.each([
    ['processMyInbox', controller.processMyInbox],
    ['archiveExtractedDoc', controller.archiveExtractedDoc],
    ['ocrSingleFile', controller.ocrSingleFile],
    ['uploadFilesToInbox', controller.uploadFilesToInbox],
    ['deleteMyArchivedDocument', controller.deleteMyArchivedDocument],
    ['restoreMyArchivedDocument', controller.restoreMyArchivedDocument],
    ['reclassifyMyArchivedDocument', controller.reclassifyMyArchivedDocument],
  ])('%s requires EXPENSES_APPROVE instead of DOCUMENTS_WRITE', (_name, handler) => {
    const scope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, handler);
    expect(scope).toBe(DelegationScope.EXPENSES_APPROVE);
  });
});
