import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { LoadingController, ModalController } from '@ionic/angular';
import { EMPTY, Observable, catchError, filter, finalize, from, map, switchMap, tap } from 'rxjs';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import { ModalExpensesComponent } from 'src/app/shared/modal-add-expenses/modal.component';

@Component({
  selector: 'app-my-storage',
  templateUrl: './my-storage.page.html',
  styleUrls: ['./my-storage.page.scss'],
})
export class MyStoragePage implements OnInit {

  // columns: IColumnDataTable = {};//Titles of table
  items$: Observable<IRowDataTable[]>;//Data of expenses
  item: IRowDataTable;
  uid: string;
  fieldsNamesToAdd: IColumnDataTable[];
  fieldsNamesToShow: IColumnDataTable[];
  isOnUpdate: boolean = false;
  isToastOpen: boolean = false;
  toastMessage: string = "";

  // tableTitle = "הוצאות אחרונות";
  public chooseYear = [
    1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006,
    2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017
  ]

  constructor(private loadingController: LoadingController, private http: HttpClient, private expenseDataService: ExpenseDataService, private modalController: ModalController) { }

  ngOnInit() {
    this.fieldsNamesToAdd = this.expenseDataService.getAddExpenseColumns();
    console.log("this.fieldsNames", this.fieldsNamesToAdd) ;

    this.fieldsNamesToShow = this.expenseDataService.getShowExpenseColumns();
    console.log("this.fieldsNames", this.fieldsNamesToShow) ;
    
    this.setUserId();
    this.setRowsData();
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
      tap((data) => console.log(data)
      ),
      
      
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
    
    //alert("open modal for: !!"+(event.toString()));
     
    this.openPopupAddExpense(expense);
  }

  onDeleteClicked(event: number): void {
    const token = localStorage.getItem('token');
    const options = {
      params: new HttpParams().set("token",token),
    }
    const url = '${environment.apiUrl}expenses/delete-expense/' + event
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
}
