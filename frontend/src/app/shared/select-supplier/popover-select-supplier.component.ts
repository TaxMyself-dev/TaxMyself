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
    [ExpenseFormColumns.SUPPLIER, 4],
    [ExpenseFormColumns.SUPPLIER_ID, 4],
    [ExpenseFormColumns.ACTIONS, 4]
  ]);

  tableActions: ITableRowAction[] = [];
  suppliersList$: Observable<IRowDataTable[]>;
  error: boolean = false;
  isOpen: boolean = false;
  message: string = "האם אתה בטוח שברצונך למחוק ספק זה?";
  id: number;

  constructor(private expenseDataService: ExpenseDataService, private modalCtrl: ModalController, private popoverController: PopoverController) { }

  ngOnInit() {
    this.getSuppliers();
    this.setTableActions();
  }

  private setTableActions(): void {
    this.tableActions = [

      {
        name: 'download file',
        icon: 'checkmark-done-circle-outline',
        action: (row: IRowDataTable) => {
          this.selectedSupplier(row);
        }
      },
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
        console.log(data);
        
      })
    )
    // .subscribe((res) => {
    //   console.log(res);
    //   this.error = false;
    //   //this.suppliersList = res
    // })
  }

  selectedSupplier(data: IRowDataTable): void {
    this.cancel(data);
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
        from(this.popoverController.create({
          component: addSupplierComponent,
          //event: ev,
          // translucent: false,
          componentProps: {
            supplier: supplier,
            editMode: true
          }
        })).pipe(
          catchError((err) => {
            console.log("openEditSupplier failed in create", err);
            return EMPTY;
          }),
          switchMap((popover) => {
            if (popover) {
              return from(popover.present()).pipe(
                switchMap(() => from(popover.onDidDismiss())),
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
              this.popoverController.dismiss(res.data?.value);//close the popover of suppliers list
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
}


