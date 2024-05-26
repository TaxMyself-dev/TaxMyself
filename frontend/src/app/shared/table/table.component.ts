import { Component, Input} from '@angular/core';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from '../interface';


@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss'],
})
export class TableComponent<TFormColumns, TFormHebrewColumns> {
  @Input() columnsWidth: Map<TFormColumns | string, number>;
  @Input() columnsToIgnore: (TFormColumns | string)[] = [];
  @Input() fieldsNames: IColumnDataTable<TFormColumns, TFormHebrewColumns>[];
  @Input() actions: ITableRowAction[]; 
  @Input() columnsOrderByFunc: (a, b) => number;
  @Input() set rows(val: IRowDataTable[]) {
    this.tableRows = val;

  }

  get rows(): IRowDataTable[] {
    return this.tableRows;
  }

  tableRows: IRowDataTable[];
  baseSize: number = 1;

  constructor() { }
}
