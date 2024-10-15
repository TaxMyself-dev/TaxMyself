import { Component, OnInit } from '@angular/core';
import { ModalController, PopoverController } from '@ionic/angular';
import { EMPTY, catchError, delay, finalize, from, switchMap } from 'rxjs';
import { addSupplierComponent } from '../add-supplier/add-supplier.component';
import { cloneDeep } from 'lodash';
import { FilesService } from 'src/app/services/files.service';
import { IGetSupplier, ISuppliers } from '../interface';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonSize } from '../button/button.enum';


@Component({
  selector: 'app-select-supplier',
  templateUrl: './select-supplier.component.html',
  styleUrls: ['./select-supplier.component.scss'],
})


export class selectSupplierComponent implements OnInit {

  readonly ButtonSize = ButtonSize;
  suppliersList: IGetSupplier[];
  error: boolean = false;
  isOpen: boolean = false;
  message: string = "האם אתה בטוח שברצונך למחוק ספק זה?";
  id: number;

  constructor(private expenseDataService: ExpenseDataService, private modalCtrl: ModalController, private popoverController: PopoverController) { }
  ngOnInit() {
    this.getSuppliers();
  }

  getSuppliers(): void {
    this.expenseDataService.getAllSuppliers()
    .pipe(
      catchError((err) => {
        console.log("err in get suppliers:", err);
        this.error = true;
        return EMPTY;
      }),
    )
    .subscribe((res) => {
      console.log(res);
      this.error = false;
      this.suppliersList = res
    })
  }

  selectedSupplier(data: IGetSupplier): void {
    this.cancel(data);
  }
  
  cancel(data?: IGetSupplier) {
    if (data) {
      this.modalCtrl.dismiss(data,'success');
    }
    else {
      this.modalCtrl.dismiss(null,'cancel');
    }
  }

  editSupplier(supplier: IGetSupplier): void{
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


