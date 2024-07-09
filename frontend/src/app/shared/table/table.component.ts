import { Component, Input, OnChanges, SimpleChanges} from '@angular/core';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from '../interface';
import { ICellRenderer } from '../enums';


@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss'],
})
export class TableComponent<TFormColumns, TFormHebrewColumns> implements OnChanges {
  @Input() columnsWidth: Map<TFormColumns | string, number>;
  @Input() columnsToIgnore: (TFormColumns | string)[] = [];
  @Input() fieldsNames: IColumnDataTable<TFormColumns, TFormHebrewColumns>[];
  @Input() actions: ITableRowAction[]; 
  @Input() columnsOrderByFunc: (a, b) => number;
  @Input() specialColumnsCellRendering: Map<TFormColumns | string, ICellRenderer>;
  @Input() set rows(val: IRowDataTable[]) {
    this.tableRows = val;

  }

  get rows(): IRowDataTable[] {
    return this.tableRows;
  }

  ICellRenderer = ICellRenderer;
  tableRows: IRowDataTable[];
  baseSize: number = 1;

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.fieldsNames) {
      
    }
  }
}
