import { Component, OnInit, Input } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { startOfMonth, endOfMonth } from 'date-fns';
import { EMPTY, Observable, catchError, filter, finalize, from, map, switchMap, tap } from 'rxjs';
import { FormTypes, ICellRenderer, months, singleMonths, TransactionsOutcomesColumns } from 'src/app/shared/enums';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { Router } from '@angular/router';


interface ReportData {
  vatableTurnover: string;
  nonVatableTurnover: string;  
  vatRefundOnAssets: number;
  vatRefundOnExpenses: number;
  vatPayment: number;
}

interface FieldTitles {
  [key: string]: string;
}

@Component({
  selector: 'app-vat-report',
  templateUrl: './vat-report.page.html',
  styleUrls: ['./vat-report.page.scss', '../../shared/shared-styling.scss'],
})
export class VatReportPage implements OnInit {

  readonly ButtonSize = ButtonSize;

  readonly COLUMNS_TO_IGNORE = ['id', 'transId', 'vatReportingDate'];

  readonly COLUMNS_WIDTH = new Map<ExpenseFormColumns, number>([

    [ExpenseFormColumns.CATEGORY, 1.3],
    [ExpenseFormColumns.SUB_CATEGORY, 1.5],
    [ExpenseFormColumns.DATE, 1.1 ],
    [ExpenseFormColumns.TAX_PERCENT, 1.5],
    [ExpenseFormColumns.VAT_PERCENT, 1.5],
    [ExpenseFormColumns.TOTAL_TAX, 1.5],
    [ExpenseFormColumns.TOTAL_VAT, 1.6],
  ]);

  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  report?: ReportData;
  displayExpenses: boolean = false;
  vatReportForm: FormGroup;
  token: string;
  reportClick: boolean = true;

  readonly fieldsNamesToShow: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
    { name: ExpenseFormColumns.VAT_PERCENT, value: ExpenseFormHebrewColumns.vatPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TAX_PERCENT, value: ExpenseFormHebrewColumns.taxPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTaxPayable, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVatPayable, type: FormTypes.NUMBER },
  ];

  readonly specialColumnsCellRendering = new Map<ExpenseFormColumns, ICellRenderer>([
    [ExpenseFormColumns.DATE, ICellRenderer.DATE],
  ]);

  tableData$: Observable<IRowDataTable[]>;

  items$: Observable<IRowDataTable[]>;
  item: IRowDataTable;
  rows: IRowDataTable[] = [];


  reportOrder: string[] = [
    'vatableTurnover',
    'nonVatableTurnover',
    'vatRefundOnAssets',
    'vatRefundOnExpenses',
    'vatPayment'
  ];

  vatReportFieldTitles = {
    vatableTurnover: 'עסקאות חייבות',
    nonVatableTurnover: 'עסקאות פטורות או בשיעור אפס',
    vatRefundOnAssets: 'תשומות ציוד',
    vatRefundOnExpenses: 'תשומות אחרות',
    vatPayment: 'סה"כ לתשלום'
  };


  constructor(private router: Router, public vatReportService: VatReportService, private formBuilder: FormBuilder, private expenseDataService: ExpenseDataService) {
    this.vatReportForm = this.formBuilder.group({
      vatableTurnover: new FormControl (
        '', Validators.required,
      ),
      nonVatableTurnover: new FormControl (
        '', Validators.required,
      ),
      month: new FormControl (
        '', Validators.required,
      ),
      year: new FormControl (
        '', Validators.required,
      ),
      isSingleMonth: new FormControl (
        '', Validators.required,
      )
    })
  }


  ngOnInit() {
    //this.setRowsData();
  }


  onSubmit() {
    console.log("onSubmit - start");
    const formData = this.vatReportForm.value;
    this.reportClick = false;
    this.setRowsData();
    this.getVarReportData(formData.month, formData.year, formData.isSingleMonth);
  }


  async getVarReportData(month: number , year: number, isSingleMonth: boolean) {

    const formData = this.vatReportForm.value;

    this.vatReportService.getVatReportData(formData)
    .subscribe((res) => {
      this.report = res;
    });

  }


  // Get the data from server and update items
  setRowsData(): void {
    const formData = this.vatReportForm.value;
    console.log("setRowsData - start");
    this.items$ = this.expenseDataService.getExpenseForVatReport(formData.isSingleMonth, formData.month)
      .pipe(
        map((data) => {
          const rows = [];
          
          data.forEach(row => {
            const { id, reductionDone, reductionPercent, expenseNumber, isEquipment, loadingDate, note, supplierID, userId, file, isReported, monthReport, ...tableData } = row;
            row.dateTimestamp = +row.dateTimestamp;

            console.log("table data for vat report is ", tableData);
            
            //tableData.dateTimestamp = this.timestampToDateStr(tableData.dateTimestamp as number);
            rows.push(tableData);
          })

          this.rows = rows;
          return rows
        })
      )
  }


  showExpenses() {
    this.displayExpenses = !this.displayExpenses
  }


  columnsOrderByFunc(a, b): number {
    const columnsAddExpenseOrder = [
      'supplier',
      'date',
      'sum',
      'category',
      'subCategory',
      'vatPercent',
      'taxPercent',
      'totalVat',
      'totalTax',
    ];

    const indexA = columnsAddExpenseOrder.indexOf(a.key);
    const indexB = columnsAddExpenseOrder.indexOf(b.key);

    if (indexA === -1 && indexB !== -1) {
      return 1; // objA is not in the order list, move it to the end
    } else if (indexA !== -1 && indexB === -1) {
      return -1; // objB is not in the order list, move it to the end
    } else if (indexA === -1 && indexB === -1) {
      return 0; // both keys are not in the order list, leave them as is
    }

    if (indexA < indexB) {
      return -1;
    } else if (indexA > indexB) {
      return 1;
    } else {
      return 0;
    }
  }

  // openVatReportLink(): void {
  
  //   this.router.navigate(https://secapp.taxes.gov.il/EMHANDOCH/LogonMaam.aspx?back=true, {
  //   })
  // }



}