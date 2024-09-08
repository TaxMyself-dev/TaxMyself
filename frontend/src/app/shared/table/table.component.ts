import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import { ICheckboxCellData, IColumnDataTable, IRowDataTable, ITableRowAction } from '../interface';
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
  @Input() checkboxData: ICheckboxCellData = {columnName: "בחר הכול"};
  @Input() disableCheckbox = true;
  @Input() set rows(val: IRowDataTable[]) {
    this.tableRows = val;
  }

  @Output() onClickedCell = new EventEmitter<{str: string, data: IRowDataTable}>();
  @Output() onChecked = new EventEmitter<{id: number, checked: boolean}>();
  @Output() onCheckedAll = new EventEmitter<{id: number[], checked: boolean}>();

  get rows(): IRowDataTable[] {
    return this.tableRows;
  }

  ICellRenderer = ICellRenderer;
  tableRows: IRowDataTable[];
  baseSize: number = 1;
  allID: number[] =[];
  isSelected: boolean = false;

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.fieldsNames) {
      
    }
  }

  openAddBill(event: IRowDataTable): any {
    this.onClickedCell.emit({str: "bill", data: event})
  }
  openAddTransaction(event: IRowDataTable): any {
    this.onClickedCell.emit({str: "tran", data: event})
  }

  onCheckedClicked(event: any): void {
    this.onChecked.emit({id: event.row.id, checked: event.$event.detail.checked})
  }
  
  selectAll(event: IRowDataTable[]): void {
    this.isSelected = !this.isSelected;
    this.isSelected ? this.checkboxData.columnName = "בטל הכול" :  this.checkboxData.columnName = "בחר הכול"
    this.isSelected ? event.forEach((row) => {this.allID.push(row.id as number)}) : this.allID = [];
    this.onCheckedAll.emit({id: this.allID, checked: this.isSelected})
    //console.log(this.allID);
    
  }
}
