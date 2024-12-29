import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ICheckboxCellData, IColumnDataTable, IRowDataTable, ITableRowAction } from '../interface';
import { ICellRenderer } from '../enums';
import { ButtonClass, ButtonSize } from '../button/button.enum';



@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss'],
})
export class TableComponent<TFormColumns, TFormHebrewColumns> implements OnChanges {
  @Input() columnsWidth: Map<TFormColumns | string, number>;
  @Input() columnsToIgnore: (TFormColumns | string)[] = [];
  @Input() actionsToIgnore: string[] = [];
  @Input() fieldsNames: IColumnDataTable<TFormColumns, TFormHebrewColumns>[];
  @Input() actions: ITableRowAction[];
  @Input() columnsOrderByFunc: (a, b) => number;
  @Input() specialColumnsCellRendering: Map<TFormColumns | string, ICellRenderer>;
  //@Input() checkboxData: ICheckboxCellData = {columnName: "בחר הכול"};
  @Input() displayCheckbox = false;
  @Input() iconSrc: string;
  @Input() beforeFile: boolean = false;
  @Input() isAvailableSelectAll: boolean = false;
  @Input() isAllChecked: boolean = false;
  @Input() checkedId: number;
  @Input() iconName: string;
  @Input() selectColumnString: string = 'בחר';
  @Input() inputSearchLable: string;
  // @Input() arrayFilter: IRowDataTable[];
  @Input() displayFilter: boolean = true;
  @Input() iconToolTip: string;
  @Input() set rows(val: IRowDataTable[]) {
    this.tableRows = val;
  }

  @Output() onClickedCell = new EventEmitter<{ str: string, data: IRowDataTable }>();
  @Output() onCheckedClicked = new EventEmitter<{ row: IRowDataTable, checked: boolean }>();
  @Output() onCheckedAll = new EventEmitter<boolean>();
  @Output() onBeforeSelectFile = new EventEmitter<{ event: any, data: IRowDataTable }>();
  @Output() filterBy: EventEmitter<string> = new EventEmitter<string>();


  get rows(): IRowDataTable[] {
    return this.tableRows;
  }

  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;

  ICellRenderer = ICellRenderer;
  tableRows: IRowDataTable[];
  baseSize: number = 1;
  allID: number[] = [];
  isSelected: boolean = false;
  isSelectedAll: boolean = false;
  isExpanded = false;
  expandedRowId: string;



  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.fieldsNames) {

    }
  }

  beforeChooseFile(event: any, data: IRowDataTable): any {
    console.log("in before file in table");

    this.onBeforeSelectFile.emit({ event: event, data: data })
  }

  openAddBill(event: IRowDataTable): any {
    this.onClickedCell.emit({ str: "bill", data: event })
  }

  openAddTransaction(event: IRowDataTable): any {
    this.onClickedCell.emit({ str: "tran", data: event })
  }

  onChecked(event: any, row: IRowDataTable): void {
    this.onCheckedClicked.emit({ row: row, checked: event.detail?.checked })
    //this.showChecked();
  }

  toggleExpand(row: IRowDataTable) {
    if (row.id === this.expandedRowId && this.isExpanded === true) {
      this.isExpanded = false;
    }
    else {
      this.isExpanded = true;
    }
    this.expandedRowId = row.id as string;
  }

  showChecked(data: IRowDataTable): boolean {
    if (this.isAvailableSelectAll) {
      if (this.isSelectedAll && !data.disabled) {
        return true;
      }
      else {
        return false;
      }
    }
    else {
      if (data.id === this.checkedId) {
        return true;
      }
      else {
        return false;
      }
    }
  }


  onSearch(event): void {
    console.log("in table", event);

    this.filterBy.emit(event);
  }



  selectAll(): void {
    if (this.isAvailableSelectAll) {
      this.isSelectedAll = !this.isSelectedAll;
      if (this.isSelectedAll) {

      }
      //   this.isSelected = !this.isSelected;
      //  // this.isSelected ? this.checkboxData.columnName = "בטל הכול" :  this.checkboxData.columnName = "בחר הכול"
      //   this.isSelected ? event.forEach((row) => {this.allID.push(row.id as number)}) : this.allID = [];
      this.onCheckedAll.emit(this.isSelectedAll)
      //   //console.log(this.allID);
      console.log('select all clicked!');

    }
  }
}
