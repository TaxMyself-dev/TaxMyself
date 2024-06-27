import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { getDownloadURL, getStorage, ref } from "@angular/fire/storage";
import { LoadingController, ModalController } from '@ionic/angular';
import { EMPTY, Observable, catchError, filter, finalize, from, map, switchMap, tap } from 'rxjs';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { FilesService } from 'src/app/services/files.service';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { ModalExpensesComponent } from 'src/app/shared/modal-add-expenses/modal.component';
import { environment } from 'src/environments/environment';
import { cloneDeep } from 'lodash';

@Component({
  selector: 'app-my-storage',
  templateUrl: './my-storage.page.html',
  styleUrls: ['./my-storage.page.scss'],
})
export class MyStoragePage implements OnInit {
  readonly COLUMNS_WIDTH = new Map<ExpenseFormColumns, number>([
    [ExpenseFormColumns.CATEGORY, 1.2],
    [ExpenseFormColumns.SUB_CATEGORY, 1.1],
    [ExpenseFormColumns.SUPPLIER, 1.2],
    [ExpenseFormColumns.DATE, 1.5]
  ]);
  readonly COLUMNS_TO_IGNORE = ['id']; 
  readonly ButtonSize = ButtonSize;
  
  // columns: IColumnDataTable = {};//Titles of table
  items$: Observable<IRowDataTable[]>;//Data of expenses
  item: IRowDataTable;
  rows: IRowDataTable[] = [];
  tableActions: ITableRowAction[] = [];
  uid: string;
  fieldsNamesToAdd: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
  fieldsNamesToShow: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
  isOnUpdate: boolean = false;
  isToastOpen: boolean = false;
  toastMessage: string = "";
  isOpen: boolean = false;
  id: number;
  message: string = "האם אתה בטוח שברצונך למחוק הוצאה זו?";

  // tableTitle = "הוצאות אחרונות";
  public chooseYear = [
    1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006,
    2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017
  ]

  constructor(private loadingController: LoadingController, private http: HttpClient, private expenseDataService: ExpenseDataService, private filesService: FilesService, private modalController: ModalController) { }

  ngOnInit() {
    this.fieldsNamesToAdd = this.expenseDataService.getAddExpenseColumns();
    console.log("this.fieldsNames", this.fieldsNamesToAdd) ;

    this.fieldsNamesToShow = this.expenseDataService.getShowExpenseColumns();
    console.log("this.fieldsNames", this.fieldsNamesToShow) ;
    
    this.setUserId();
    this.setRowsData();
    this.setTableActions();
    this.expenseDataService.updateTable$.subscribe(
      (data) => {
        if (data) {
          this.setRowsData();
        }
      })
  }

  private setUserId(): void {
    const tempA = localStorage.getItem('user');
    const tempB = JSON.parse(tempA)
    this.uid = tempB.uid;
    console.log(this.uid);
  }

  // Get the data from server and update items
  setRowsData(): void {
    this.items$ = this.expenseDataService.getExpenseByUser(this.uid)
    .pipe(
      map((data) => {
        const rows = [];
      data.forEach(row => {
        const { reductionDone, reductionPercent, expenseNumber, file, isEquipment, loadingDate, note, supplierID, userId, ...tableData } = row;
        tableData.dateTimestamp = "24-01-2023"; //TODO: update to convert from timestamp to string
        rows.push(tableData);
      })
      this.rows = rows;
    return rows
  })
    )
    console.log(this.items$);
    
  }

  openPopupAddExpense(data?: IRowDataTable): void {
    console.log("this.fieldsNames in open", this.fieldsNamesToAdd) ;
    console.log("data in open", data) ;
      from(this.modalController.create({

        component: ModalExpensesComponent,
        //showBackdrop: false,
        componentProps: {
          columns: this.fieldsNamesToAdd,
          editMode: !!Object.keys(data).length,
          data
        }
      })).pipe(catchError((err) => {
        alert("openPopupAddExpense error");
        return EMPTY;
      }), switchMap((modal) => from(modal.present())), catchError((err) => {
        alert("openPopupAddExpense switchMap error");
        console.log(err);
        
        return EMPTY;
      })).subscribe();
  }

  onUpdateClicked(expense: IRowDataTable ): void {
    console.log("in my storage", expense);
    const expenseData = this.rows.find((row) => row.id === expense.id);
    //alert("open modal for: !!"+(event.toString()));
     
    this.openPopupAddExpense(cloneDeep(expenseData));
  }

  onDeleteClicked(event: number): void {
    const token = localStorage.getItem('token');
    const options = {
      params: new HttpParams().set("token",token),
    }
    const url = `${environment.apiUrl}expenses/delete-expense/` + event
    this.getLoader()
    .pipe(
      finalize(() => this.loadingController.dismiss()),
      switchMap(() => this.http.delete(url,options)),
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
  
        const storage = getStorage();
        getDownloadURL(ref(storage, fileName as string))
          .then((url) => {
            // `url` is the download URL for 'images/stars.jpg'
            console.log("'url: ", url);
  
            // This can be downloaded directly:
            const xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';
            xhr.onload = (event) => {
              const blob = new Blob([xhr.response], { type: 'image/jpg' });
              const a: any = document.createElement('a');
              a.style = 'display: none';
              document.body.appendChild(a);
              const url = window.URL.createObjectURL(blob);
              a.href = url;
              a.download = fileName;
              a.click();
              window.URL.revokeObjectURL(url);
            };
            xhr.open('GET', url);
            xhr.send();
          })
          .catch((error) => {
            console.log("dhgsedgsdf", error);
            alert("לא ניתן להוריד את הקובץ")
          });
      }
      else {
        alert("לא נשמר קובץ עבור הוצאה זו")
      }
    }

    onPreviewFileClicked(expense: IRowDataTable): void {
      const selectedExpense = this.rows.find((row) => row.id === expense.id);
    const fileName = selectedExpense.file;
    if (!(fileName === undefined || fileName === "" || fileName === null)) {
      from(this.filesService.downloadFile(fileName as string)).pipe(catchError((err) => {
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
    console.log("event in table", this.id);
    this.onDeleteClicked(this.id);
    this.isOpen = false;
  }

  confirmDel(ev: IRowDataTable): void {
    console.log("event in confirm ", ev);
    this.id = +ev.id;
    this.isOpen = true;
  }

  cancelDel(): void {
    this.isOpen = false;
  }

  columnsOrderByFunc(a, b): number {
    const columnsAddExpenseOrder = [
      'supplier',
      'dateTimestamp',
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
        action: (row: IRowDataTable) => {
          this.confirmDel(row);
        }
      },
      {
        name: 'share',
        icon: 'share-social-outline',
        action: (row: IRowDataTable) => {
          console.log('TODO: share-social-outline');
        }
      },
      {
        name: 'preview',
        icon: 'glasses-outline',
        action: (row: IRowDataTable) => {
          this.onPreviewFileClicked(row);
        }
      },
      {
        name: 'update',
        icon: 'create-outline',
        action: (row: IRowDataTable) => {
          this.onUpdateClicked(row);
        }
      },
      {
        name: 'download file',
        icon: 'cloud-download-outline',
        action: (row: IRowDataTable) => {
          this.onDownloadFileClicked(row);
        }
      }
    ]
  }
}
