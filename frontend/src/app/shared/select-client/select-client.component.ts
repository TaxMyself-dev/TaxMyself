import { Component, Input, OnInit } from '@angular/core';
import { ModalController, PopoverController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, catchError, delay, finalize, from, map, switchMap, tap } from 'rxjs';
import { addSupplierComponent } from '../add-supplier/add-supplier.component';
import { cloneDeep } from 'lodash';
import { IColumnDataTable, IGetSupplier, IRowDataTable, ISelectItem, ISuppliers, ITableRowAction } from '../interface';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonSize } from '../button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, TransactionsOutcomesColumns } from '../enums';
import { DocCreateService } from 'src/app/pages/doc-create/doc-create.service';


@Component({
  selector: 'app-select-client',
  templateUrl: './select-client.component.html',
  styleUrls: ['./select-client.component.scss'],
})
export class SelectClientComponent  implements OnInit {





  readonly COLUMNS_TO_IGNORE = ['id', 'userId'];
  readonly ButtonSize = ButtonSize;

  readonly fieldsName: IColumnDataTable<FieldsCreateDocName, FieldsCreateDocValue>[] = [
    { name: FieldsCreateDocName.clientName, value: FieldsCreateDocValue.CLIENT_NAME, type: FormTypes.TEXT },
    { name: FieldsCreateDocName.clientEmail, value: FieldsCreateDocValue.CLIENT_EMAIL, type: FormTypes.TEXT },
    { name: FieldsCreateDocName.clientPhone, value: FieldsCreateDocValue.CLIENT_PHONE, type: FormTypes.TEXT },
  ];

  readonly COLUMNS_WIDTH = new Map<FieldsCreateDocValue | ExpenseFormColumns, number>([
    [FieldsCreateDocValue.CLIENT_NAME, 3.7],
    [FieldsCreateDocValue.CLIENT_EMAIL, 3.5],
    [FieldsCreateDocValue.CLIENT_PHONE, 3.5],
    [ExpenseFormColumns.ACTIONS, 3.8],
    [ExpenseFormColumns.CHECKBOX, 1]
  ]);

  tableActions: ITableRowAction[] = [];
  // suppliersList$: Observable<IRowDataTable[]>;
  clientsList$ = new BehaviorSubject<IRowDataTable[]>(null);

  clientsList: IRowDataTable[];
  error: boolean = false;
  isOpen: boolean = false;
  message: string = "האם אתה בטוח שברצונך למחוק לקוח זה?";
  id: number;
  checkedSupplier: any;

  constructor(private expenseDataService: ExpenseDataService, private modalCtrl: ModalController, private docCreateService: DocCreateService) { }

  ngOnInit() {
    //this.getSuppliers();
    this.setTableActions();
    this.getClients();
  }

  private setTableActions(): void {
    this.tableActions = [

      {
        name: 'delete',
        icon: 'trash-outline',
        action: (row: IRowDataTable) => {
          this.confirmDel(row.id as number);
        }
      },
      {
        name: 'update',
        icon: 'create-outline',
        action: (row: IRowDataTable) => {
          this.editSupplier(row);
        }
      }
    ]
  }

  getClients(): void {
    this.docCreateService.getClients()
      .pipe(
        catchError((err) => {
          console.log("err in get clients: ", err);
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("res in get clients: ", res);
        this.clientsList = res;
        this.clientsList$.next(this.clientsList);
      })
  }


  selectedSupplier(): void {
    this.cancel(this.checkedSupplier.row);
  }

  cancel(data?: IRowDataTable) {
    if (data) {
      this.modalCtrl.dismiss(data, 'success');
    }
    else {
      this.modalCtrl.dismiss(null, 'cancel');
    }
  }

  editSupplier(supplier: IRowDataTable): void {
    from(this.modalCtrl.create({
      component: addSupplierComponent,
      componentProps: {
        supplier: supplier,
        editMode: true
      },
      cssClass: 'edit-supplier'
    })).pipe(
      catchError((err) => {
        console.log("openEditSupplier failed in create", err);
        return EMPTY;
      }),
      switchMap((modal) => {
        if (modal) {
          return from(modal.present()).pipe(
            switchMap(() => from(modal.onDidDismiss())),
            catchError((err) => {
              console.log("openEditSupplier failed in present", err);
              return EMPTY;
            })
          );
        }
        else {
          console.log('Popover modal is null');
          return EMPTY;
        }
      })
    ).subscribe((res) => {
      console.log(res.data?.value);
      //this.getSuppliers();
      // if (res.role === "send")
      // this.modalCtrl.dismiss(res.data?.value);//close the popover of suppliers list
    })

  }

  deleteSupplier(): void {
    console.log("id of del sup", this.id);

    this.expenseDataService.deleteSupplier(this.id)
      .pipe(
        finalize(() => { this.isOpen = false }),
        catchError((err) => {
          console.log("err in delete supplier: ", err);
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log(res);
        //this.getSuppliers();
      })
  }

  cancelDel(): void {
    this.isOpen = false;
  }

  confirmDel(id: number): void {
    console.log("event in confirm ", id);
    this.id = id;
    this.isOpen = true;
  }

  onChecked(event: any): void {
    console.log("checked event: ", event);
    if (event.checked) {
      this.checkedSupplier = event;
    }
    else {
      this.checkedSupplier = null
    }
    console.log("checkedSupplier: ", this.checkedSupplier);

  }

  filterClients(filtrrBy: string): void {
    console.log(filtrrBy);
    this.clientsList$.next(this.clientsList.filter((supplier) => supplier.supplier.toString().includes(filtrrBy)));

  }
}