import { Component, OnInit } from '@angular/core';
import { ModalController, PopoverController } from '@ionic/angular';
import { EMPTY, Observable, catchError, delay, finalize, from, map, switchMap, tap } from 'rxjs';
import { addSupplierComponent } from '../add-supplier/add-supplier.component';
import { cloneDeep } from 'lodash';
import { FilesService } from 'src/app/services/files.service';
import { IColumnDataTable, IGetSupplier, IRowDataTable, ISuppliers, ITableRowAction } from '../interface';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonSize } from '../button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, TransactionsOutcomesColumns } from '../enums';


@Component({
  selector: 'app-select-supplier',
  templateUrl: './select-supplier.component.html',
  styleUrls: ['./select-supplier.component.scss'],
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
  suppliersList$: Observable<IRowDataTable[]>;
  error: boolean = false;
  isOpen: boolean = false;
  message: string = "האם אתה בטוח שברצונך למחוק ספק זה?";
  id: number;
  checkedSupplier: any;

  constructor(private expenseDataService: ExpenseDataService, private modalCtrl: ModalController, private popoverController: PopoverController) { }

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
    this.suppliersList$ = this.expenseDataService.getAllSuppliers()
    .pipe(
      catchError((err) => {
        console.log("err in get suppliers:", err);
        this.error = true;
        return EMPTY;
      }),
      tap((data) => {
        if (data?.length <= 0) {
          this.suppliersList$ = null
        }
        console.log(data);
        
      })
    )
    // .subscribe((res) => {
    //   console.log(res);
    //   this.error = false;
    //   //this.suppliersList = res
    // })
  }

  selectedSupplier(): void {
    this.cancel(this.checkedSupplier.row);
  }
  
  cancel(data?: IRowDataTable) {
    if (data) {
      this.modalCtrl.dismiss(data,'success');
    }
    else {
      this.modalCtrl.dismiss(null,'cancel');
    }
  }

  editSupplier(supplier: IRowDataTable): void{
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

  deleteSupplier(): void {
    console.log("id of del sup",this.id);
    
    this.expenseDataService.deleteSupplier(this.id)
    .pipe(
      finalize(()=> {this.isOpen = false}),
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
    console.log("checkedSupplier: ",this.checkedSupplier);
    
  }
}


