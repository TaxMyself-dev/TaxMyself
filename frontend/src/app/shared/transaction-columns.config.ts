import {
  BusinessStatus,
  FormTypes,
  ICellRenderer,
  TransactionsOutcomesColumns,
  TransactionsOutcomesHebrewColumns,
} from './enums';
import { IColumnDataTable } from './interface';

export interface TransactionColumnOptions {
  businessStatus: BusinessStatus;
  isOnlyEmployer: boolean;
}

/**
 * Base column set — the single source of truth for transaction tables.
 * Used by both the Transactions page and My Account page.
 */
export const BASE_TRANSACTION_COLUMNS: IColumnDataTable<
  TransactionsOutcomesColumns,
  TransactionsOutcomesHebrewColumns
>[] = [
  { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
  { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
  { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER },
  { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
  { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
  { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
  { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
  { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.TEXT, hide: true },
  { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport, type: FormTypes.TEXT, hide: true },
  { name: TransactionsOutcomesColumns.NOTE, value: TransactionsOutcomesHebrewColumns.note, type: FormTypes.TEXT },
];

/**
 * Returns a filtered/extended column list based on user context.
 * - Inserts BUSINESS_NUMBER before NOTE for multi/single-business users.
 * - Strips hidden columns for employer-only users.
 */
export function buildTransactionColumns(
  options: TransactionColumnOptions,
): IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] {
  let cols = [...BASE_TRANSACTION_COLUMNS];

  if (options.businessStatus !== BusinessStatus.NO_BUSINESS) {
    const businessCol: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns> = {
      name: TransactionsOutcomesColumns.BUSINESS_NUMBER,
      value: TransactionsOutcomesHebrewColumns.businessNumber,
      type: FormTypes.TEXT,
    };
    const noteIdx = cols.findIndex(c => c.name === TransactionsOutcomesColumns.NOTE);
    cols.splice(noteIdx >= 0 ? noteIdx : cols.length, 0, businessCol);
  }

  if (options.isOnlyEmployer) {
    cols = cols.filter(c => !c.hide);
  }

  return cols;
}
