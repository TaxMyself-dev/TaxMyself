import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
// import { getDownloadURL, getStorage, ref } from "@angular/fire/storage";
import { LoadingController, ModalController } from '@ionic/angular';
import { EMPTY, Observable, catchError, finalize, from, switchMap, tap } from 'rxjs';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { FilesService } from 'src/app/services/files.service';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, ICellRenderer, ReportingPeriodType } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ISelectItem, ITableRowAction, IUserDate } from 'src/app/shared/interface';
import { ModalExpensesComponent } from 'src/app/shared/modal-add-expenses/modal.component';
import { environment } from 'src/environments/environment';
import { cloneDeep } from 'lodash';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-my-storage',
  templateUrl: './my-storage.page.html',
  styleUrls: ['./my-storage.page.scss', '../../shared/shared-styling.scss'],
})
export class MyStoragePage implements OnInit {

  readonly COLUMNS_WIDTH = new Map<ExpenseFormColumns, number>([
    [ExpenseFormColumns.CATEGORY, 1.2],
    [ExpenseFormColumns.SUB_CATEGORY, 1.1],
    [ExpenseFormColumns.SUPPLIER, 1.2],
    [ExpenseFormColumns.DATE, 1.5]
  ]);

  readonly specialColumnsCellRendering = new Map<ExpenseFormColumns, ICellRenderer>([
    [ExpenseFormColumns.DATE, ICellRenderer.DATE],
  ]);
  readonly COLUMNS_TO_IGNORE = ['businessNumber', 'reductionDone', 'reductionPercent', 'expenseNumber', 'isEquipment', 'loadingDate', 'note', 'supplierID', 'userId', 'id', 'file', 'isReported', 'vatReportingDate', 'transId'];
  readonly ACTIONS_TO_IGNORE = ['share', 'preview', 'download file'];
  readonly ButtonSize = ButtonSize;
  readonly reportingPeriodType = ReportingPeriodType;

  filterRows: IRowDataTable[]; // Holds the filter text
  items$: Observable<IRowDataTable[]>;//Data of expenses
  rows: IRowDataTable[] = [];
  tableActions: ITableRowAction[] = [];
  fieldsNamesToAdd: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
  fieldsNamesToShow: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
  isToastOpen: boolean = false;
  toastMessage: string = "";
  isOpen: boolean = false;
  id: number;
  message: string = "האם אתה בטוח שברצונך למחוק הוצאה זו?";
  storageForm: FormGroup;
  userData: IUserDate;
  businessNamesList: ISelectItem[] = [];


  constructor(private loadingController: LoadingController, private http: HttpClient, private expenseDataService: ExpenseDataService, private filesService: FilesService, private modalController: ModalController, private formBuilder: FormBuilder, private genericService: GenericService, private dateService: DateService, private authService: AuthService) {
    this.storageForm = this.formBuilder.group({
      reportingPeriodType: new FormControl(
        false, Validators.required,
      ),
      month: new FormControl(
        '', [],
      ),
      year: new FormControl(
        '', [],
      ),
      startDate: new FormControl(
        '', [],
      ),
      endDate: new FormControl(
        '', [],
      ),
      businessNumber: new FormControl(
        '', [],
      ),
      // supplier: new FormControl(
      //   '', Validators.required,
      // ),
      // category: new FormControl(
      //   '', Validators.required,
      // )
    })
  }

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData.isTwoBusinessOwner) {
      this.businessNamesList.push({name: this.userData.businessName, value: this.userData.businessNumber});
      this.businessNamesList.push({name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber});
    }
    this.fieldsNamesToAdd = this.expenseDataService.getAddExpenseColumns();
    this.fieldsNamesToShow = this.expenseDataService.getShowExpenseColumns();
    this.setRowsData();
    this.setTableActions();
    this.expenseDataService.updateTable$.subscribe(
      (data) => {
        if (data) {
          this.setRowsData();
        }
      })
  }

  setFormValidators(event): void {
    switch (event.value) {
      case this.reportingPeriodType.ANNUAL:
        this.storageForm.controls['month']?.setValidators([]);// for reset month control
        this.storageForm.controls['startDate']?.setValidators([]);// for reset month control
        this.storageForm.controls['endDate']?.setValidators([]);// for reset month control
        this.storageForm.controls['year']?.setValidators([Validators.required]);
        Object.values(this.storageForm.controls).forEach((control) => {
          control.updateValueAndValidity();

        });
        break;

      case this.reportingPeriodType.DATE_RANGE:
        this.storageForm.controls['year']?.setValidators([]);// for reset year control
        this.storageForm.controls['month']?.setValidators([]);// for reset month control
        this.storageForm.controls['startDate']?.setValidators([Validators.required]);
        this.storageForm.controls['startDate']?.updateValueAndValidity();
        this.storageForm.controls['endDate']?.setValidators([Validators.required]);
        Object.values(this.storageForm.controls).forEach((control) => {
          control.updateValueAndValidity();
        });
        break;

      case this.reportingPeriodType.BIMONTHLY:
      case this.reportingPeriodType.MONTHLY:
        this.storageForm.controls['startDate']?.setValidators([]);
        this.storageForm.controls['endDate']?.setValidators([]);
        this.storageForm.controls['month']?.setValidators([Validators.required]);
        this.storageForm.controls['year']?.setValidators([Validators.required]);
        Object.values(this.storageForm.controls).forEach((control) => {
          control.updateValueAndValidity();
        });
    }

  }


  // Get the data from server and update items
  setRowsData(): void {
    const formData = this.storageForm.value;
    console.log("formData of storage",formData);
    let startDate: string;
    let endDate: string;
    let businessNumber: string;
   
    
    if (!formData.reportingPeriodType) {
      businessNumber = this.userData.businessNumber;
      // Set default values if periodType is false
      startDate = '01/01/2000';
      endDate = this.dateService.formatDate(new Date()); 
    } else {
      // Call the function if periodType is valid
      ({ startDate, endDate } = this.dateService.getStartAndEndDates(
        formData.reportingPeriodType,
        formData.year,
        formData.month,
        formData.startDate,
        formData.endDate
      ));
      if (this.userData.isTwoBusinessOwner) {
        businessNumber = formData.businessNumber;
      }
      else {
        businessNumber = this.userData.businessNumber;
      }
    }
    console.log("startDate: ", startDate, "end date: ", endDate, "businnes: ", businessNumber);
    

    this.items$ = this.expenseDataService.getExpenseByUser(startDate, endDate, businessNumber)
      .pipe(
        tap((data) => {
          console.log(data);

          const rows = [];
          data.forEach((row) => {
            row.sum = this.genericService.addComma(row.sum as string);
            row.totalTaxPayable = this.genericService.addComma(row.totalTaxPayable as string);
            row.totalVatPayable = this.genericService.addComma(row.totalVatPayable as string);
            rows.push(row);
          })
          this.filterRows = rows;
          this.rows = rows;
        })
      )
  }

  updateFilter(filter: string): void {
    this.filterRows = this.rows.filter((row) => {
      return String(row.supplier).includes(filter);
    })
  }

  openPopupAddExpense(data?: IRowDataTable): void {
    from(this.modalController.create({
      component: ModalExpensesComponent,
      componentProps: {
        columns: this.fieldsNamesToAdd,
        editMode: !!Object.keys(data).length,
        data
      },
      cssClass: 'expense-modal'
    })).pipe(catchError((err) => {
      alert("openPopupAddExpense error");
      return EMPTY;
    }), switchMap((modal) => from(modal.present())), catchError((err) => {
      alert("openPopupAddExpense switchMap error");
      console.log("openPopupAddExpense switchMap error: ", err);

      return EMPTY;
    })).subscribe();
  }

  onUpdateClicked(expense: IRowDataTable): void {
    const expenseData = this.rows.find((row) => row.id === expense.id);
    this.openPopupAddExpense(cloneDeep(expenseData));
  }

  onDeleteClicked(event: number): void {
    const token = localStorage.getItem('token');
    const options = {
      params: new HttpParams().set("token", token),
    }
    const url = `${environment.apiUrl}expenses/delete-expense/` + event
    this.getLoader()
      .pipe(
        finalize(() => this.loadingController.dismiss()),
        switchMap(() => this.http.delete(url, options)),
        catchError((err) => {
          this.toastMessage = "אירעה שגיאה לא ניתן למחוק את ההוצאה, אנא ודא שהינך מחובר למערכת או נסה מאוחר יותר";
          this.isToastOpen = true;
          console.log("The expense cannot be deleted", err);
          return EMPTY;
        })).subscribe((res) => {
          console.log("resfrom delete: ", res);
          this.setRowsData();
        })

  }

  onDownloadFileClicked(expense: IRowDataTable): void {
    const selectedExpense = this.rows.find((row) => row.id === expense.id);
    const fileName = selectedExpense.file;
    if (!(fileName === undefined || fileName === "" || fileName === null)) {
      this.filesService.downloadFile(fileName as string)
    }
    else {
      alert("לא נשמר קובץ עבור הוצאה זו")
    }
  }

  onPreviewFileClicked(expense: IRowDataTable): void {
    if (!(expense.file === undefined || expense.file === "" || expense.file === null)) {
      this.genericService.getLoader().subscribe();
      from(this.filesService.previewFile(expense.file as string))
        .pipe(
          finalize(() => this.genericService.dismissLoader()),
          catchError((err) => {
            console.log("err in try to open file: ", err);
            alert("לא ניתן לפתוח את הקובץ");
            return EMPTY;
          })).subscribe((fileUrl) => {
            window.open(fileUrl.file, '_blank');
          });
    }
    else {
      alert("לא נשמר קובץ עבור הוצאה זו")
    }
  }

  getLoader(): Observable<any> {
    return from(this.loadingController.create({
      message: 'Please wait...',
      spinner: 'crescent'
    }))
      .pipe(
        catchError((err) => {
          console.log("err in create loader in save supplier", err);
          return EMPTY;
        }),
        switchMap((loader) => {
          if (loader) {
            return from(loader.present())
          }
          console.log("loader in save supplier is null");
          return EMPTY;
        }),
        catchError((err) => {
          console.log("err in open loader in save supplier", err);
          return EMPTY;
        })
      )
  }

  setOpenToast(): void {
    this.isToastOpen = false;
  }

  deleteExpense(): void {
    this.onDeleteClicked(this.id);
    this.isOpen = false;
  }

  confirmDel(ev: IRowDataTable): void {
    this.id = +ev.id;
    this.isOpen = true;
  }

  cancelDel(): void {
    this.isOpen = false;
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
      'totalTax',
      'totalVat',
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

  private setTableActions(): void {
    this.tableActions = [
      {
        name: 'delete',
        icon: 'trash-outline',
        title: 'מחק הוצאה',
        action: (row: IRowDataTable) => {
          this.confirmDel(row);
        }
      },
      // {
      //   name: 'share',
      //   icon: 'share-social-outline',
      //   title: 'שתף קובץ',
      //   action: (row: IRowDataTable) => {
      //     console.log('TODO: share-social-outline');
      //   }
      // },
      {
        name: 'preview',
        icon: 'glasses-outline',
        title: 'הצג קובץ',
        action: (row: IRowDataTable) => {
          this.onPreviewFileClicked(row);
        }
      },
      {
        name: 'update',
        icon: 'create-outline',
        title: 'ערוך הוצאה',
        action: (row: IRowDataTable) => {
          this.onUpdateClicked(row);
        }
      },
      {
        name: 'download file',
        icon: 'cloud-download-outline',
        title: 'הורד קובץ',
        action: (row: IRowDataTable) => {
          this.onDownloadFileClicked(row);
        }
      }
    ]
  }

}
