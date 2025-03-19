import { Component, Input, OnInit } from '@angular/core';
import { ModalController, PopoverController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, catchError, delay, finalize, from, map, switchMap, tap } from 'rxjs';
import { addSupplierComponent } from '../add-supplier/add-supplier.component';
import { cloneDeep } from 'lodash';
import { FilesService } from 'src/app/services/files.service';
import { IColumnDataTable, IGetSupplier, IRowDataTable, ISelectItem, ISuppliers, ITableRowAction } from '../interface';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonSize } from '../button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, TransactionsOutcomesColumns } from '../enums';
import { GenericService } from 'src/app/services/generic.service';


@Component({
    selector: 'app-select-supplier',
    templateUrl: './select-supplier.component.html',
    styleUrls: ['./select-supplier.component.scss'],
    standalone: false
})


export class selectSupplierComponent implements OnInit {

  readonly COLUMNS_TO_IGNORE = ['id', 'category', 'subCategory', 'taxPercent', 'vatPercent', 'isEquipment', 'reductionPercent'];
  readonly ButtonSize = ButtonSize;

  readonly fieldsName: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUPPLIER_ID, value: ExpenseFormHebrewColumns.supplierID, type: FormTypes.DATE },
  ];

  readonly COLUMNS_WIDTH = new Map<ExpenseFormColumns, number>([
    [ExpenseFormColumns.SUPPLIER, 3.7],
    [ExpenseFormColumns.SUPPLIER_ID, 3.5],
    [ExpenseFormColumns.ACTIONS, 3.8],
    [ExpenseFormColumns.CHECKBOX, 1]
  ]);

  tableActions: ITableRowAction[] = [];
  // suppliersList$: Observable<IRowDataTable[]>;
  suppliersList$ = new BehaviorSubject<IRowDataTable[]>(null);

  supplierList: IRowDataTable[];
  error: boolean = false;
  isOpen: boolean = false;
  message: string = "האם אתה בטוח שברצונך למחוק ספק זה?";
  checkedSupplier: any;

  constructor(private genericService: GenericService,  private expenseDataService: ExpenseDataService, private modalCtrl: ModalController) { }

  ngOnInit() {
    this.getSuppliers();
    this.setTableActions();
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

  getSuppliers(): void {
    this.expenseDataService.getAllSuppliers()
      .pipe(
        catchError((err) => {
          console.log("err in get suppliers:", err);
          this.error = true;
          return EMPTY;
        }),
        map((data) => {
          return data.length ? data.map((supplier: IGetSupplier) => ({
            id: supplier.id,
            subCategory: supplier.subCategory,
            category: supplier.category,
            taxPercent: supplier.taxPercent,
            vatPercent: supplier.vatPercent,
            supplier: supplier.supplier,
            supplierID: supplier.supplierID,
            isEquipment: supplier.isEquipment,
            reductionPercent: supplier.reductionPercent
          } as IRowDataTable
          )) : null;
        }),
      tap((data: IRowDataTable[]) => {
        this.supplierList = data;
        this.suppliersList$.next(data);
      }))
      .subscribe();

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
      this.getSuppliers();
      // if (res.role === "send")
      // this.modalCtrl.dismiss(res.data?.value);//close the popover of suppliers list
    })

  }

  deleteSupplier(id: number): void {
    console.log("id of del sup", id);

    this.expenseDataService.deleteSupplier(id)
      .pipe(
        finalize(() => { this.isOpen = false }),
        catchError((err) => {
          console.log("err in delete supplier: ", err);
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log(res);
        this.getSuppliers();
      })
  }

  confirmDel(id: number): void {
    console.log("event in confirm ", id);
    this.genericService.openPopupConfirm(this.message, "מחק", "בטל")
    .subscribe((res) => {
       if (res.data) {
         this.deleteSupplier(id);
       }
     })
  }

  onChecked(event: any): void {
    if (event.checked) {
      this.checkedSupplier = event;
    }
    else {
      this.checkedSupplier = null
    }
  }

  filterSuppliers(filterBy: string): void {
    console.log(filterBy);
    this.suppliersList$.next(this.supplierList.filter((supplier) => supplier.supplier.toString().includes(filterBy)));

  }
}


