import { IRowDataTable } from 'src/app/shared/interface';
import { hasStoredTableFile, IGenericTableAction, resolveTableActions, TableActionContext } from './table-actions';

describe('Shared action visibility and attachment policy', () => {
  const context: TableActionContext = { fileEditingEnabled: true, fileAttachmentEnabled: false, filesAttached: new Map() };
  const action = (name: string, extra: Partial<IGenericTableAction> = {}): IGenericTableAction =>
    ({ name, icon: 'pi pi-eye', action: () => {}, ...extra });
  const names = (actions: IGenericTableAction[], row: IRowDataTable, config = context) =>
    resolveTableActions(actions, row, config, () => {}).map(a => a.name);

  for (const file of [undefined, null, '', '   ', 0]) {
    it('does not mistake ' + JSON.stringify(file) + ' for a stored file', () => {
      expect(hasStoredTableFile({ id: 1, file })).toBeFalse();
    });
  }
  it('recognizes legacy files and numeric/string Drive IDs', () => {
    expect(hasStoredTableFile({ file: 'receipt.pdf' })).toBeTrue();
    expect(hasStoredTableFile({ sourceDocumentId: '42' })).toBeTrue();
    expect(hasStoredTableFile({ sourceDocumentId: 42 })).toBeTrue();
    expect(hasStoredTableFile({ sourceDocumentId: 0 })).toBeFalse();
  });
  it('combines file requirements and showWhen rather than overriding either', () => {
    const actions = [action('always'), action('file', { fileRequirement: 'stored', showWhen: row => !!row['allowed'] })];
    expect(names(actions, { id: 1, allowed: true })).toEqual(['always']);
    expect(names(actions, { id: 1, file: 'file', allowed: false })).toEqual(['always']);
    expect(names(actions, { id: 1, sourceDocumentId: 1, allowed: true })).toEqual(['always', 'file']);
  });
  it('keeps explicit action order and identity', () => {
    const actions = [action('allocation'), action('preview', { fileRequirement: 'stored' }), action('classify')];
    expect(resolveTableActions(actions, { file: 'file' }, context, () => {})).toEqual(actions);
  });
  it('does not add attachment controls to a normal table or an empty list by default', () => {
    expect(names([action('edit')], { id: 1 })).toEqual(['edit']);
    expect(names([], { id: 1 })).toEqual([]);
  });
  it('adds the opt-in attachment fallback only without a stored file', () => {
    const config = { ...context, fileAttachmentEnabled: true };
    expect(names([], { id: 1 }, config)).toEqual(['__attach-file']);
    expect(names([], { id: 1, sourceDocumentId: 42 }, config)).toEqual([]);
    expect(names([], { id: 1, file: 'file' }, config)).toEqual([]);
    expect(names([], { id: 1 }, { ...config, fileEditingEnabled: false })).toEqual([]);
  });
  it('preserves the attached-file label and maps attachment to its explicit row', () => {
    const file = new File(['pdf'], 'new.pdf');
    const row = { id: 1 };
    const attach = jasmine.createSpy('attach');
    const [resolved] = resolveTableActions([], row, { ...context, fileAttachmentEnabled: true, filesAttached: new Map([[1, file]]) }, attach);
    expect(resolved.title).toBe('שנה קובץ: new.pdf');
    resolved.action(null, row);
    expect(attach).toHaveBeenCalledOnceWith(row);
  });
  it('retains attachmentCount/fileName label fallback', () => {
    const [resolved] = resolveTableActions([], { id: 1, attachmentCount: 1, fileName: 'saved.pdf' },
      { ...context, fileAttachmentEnabled: true }, () => {});
    expect(resolved.title).toBe('שנה קובץ: saved.pdf');
  });
  it('file editing flags leave read-only preview/download available', () => {
    const actions = [action('preview'), action('replace', { requiresFileEditing: true })];
    expect(names(actions, { id: 1 }, { ...context, fileEditingEnabled: false })).toEqual(['preview']);
  });
});
