import { IRowDataTable, ITableRowAction } from 'src/app/shared/interface';

/** The legacy app-table keeps ITableRowAction; generic-table has one explicit contract. */
export interface IGenericTableAction extends Omit<ITableRowAction, 'alwaysShow'> {
  /** Preserve the existing desktop icon strip or labelled row buttons. */
  desktopDisplay?: 'icon' | 'label';
  /** File presence is independent of showWhen; omission means no file requirement. */
  fileRequirement?: 'stored';
  /** Only file replacement needs an HTMLInputElement as the first callback argument. */
  execution?: 'fileInput';
  requiresFileEditing?: boolean;
}

export interface TableActionContext {
  fileEditingEnabled: boolean;
  fileAttachmentEnabled: boolean;
  filesAttached: Map<number, File>;
}

export function hasStoredTableFile(row?: IRowDataTable): boolean {
  if (!row) return false;
  return (typeof row['file'] === 'string' && row['file'].trim() !== '')
    || Number(row['sourceDocumentId'] ?? 0) > 0;
}

/** Both renderers consume this list, in the consumer's explicit order. */
export function resolveTableActions(
  actions: IGenericTableAction[], row: IRowDataTable, context: TableActionContext,
  attach: (row: IRowDataTable) => void,
): IGenericTableAction[] {
  if (!row) return [];
  const visible = actions.filter(action =>
    (!action.showWhen || action.showWhen(row))
    && (action.fileRequirement !== 'stored' || hasStoredTableFile(row))
    && (!action.requiresFileEditing || context.fileEditingEnabled)
  );
  if (context.fileAttachmentEnabled && context.fileEditingEnabled && !hasStoredTableFile(row)) {
    const attached = context.filesAttached.get(row.id as number);
    const hasAttached = !!attached || Number(row['attachmentCount'] ?? 0) > 0;
    const fileName = attached?.name || row['fileName'] || 'קובץ מצורף';
    visible.push({
      name: '__attach-file', icon: 'pi pi-paperclip', desktopDisplay: 'icon',
      title: hasAttached ? `שנה קובץ: ${fileName}` : 'צרף קובץ',
      action: (_event, target) => attach(target),
    });
  }
  return visible;
}
