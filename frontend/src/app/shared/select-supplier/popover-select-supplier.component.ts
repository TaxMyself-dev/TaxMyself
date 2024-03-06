import { Component, OnInit } from '@angular/core';
import { ModalController, PopoverController } from '@ionic/angular';
import { EMPTY, catchError, delay, finalize, from, switchMap } from 'rxjs';
import { addSupplierComponent } from '../add-supplier/add-supplier.component';
import { cloneDeep } from 'lodash';
import { FilesService } from 'src/app/services/files.service';
import { IGetSupplier, ISuppliers } from '../interface';
import { ExpenseDataService } from 'src/app/services/expense-data.service';


@Component({
  selector: 'app-select-supplier',
  templateUrl: './select-supplier.component.html',
  styleUrls: ['./select-supplier.component.scss'],
})


export class selectSupplierComponent implements OnInit {

  suppliersList: IGetSupplier[];

  constructor(private expenseDataService: ExpenseDataService, private modalCtrl: ModalController, private popoverController: PopoverController) { }
  ngOnInit() {
    this.getSuppliers();
  }

  getSuppliers(): void {
    this.expenseDataService.getAllSuppliers()
    .pipe(
      catchError((err) => {
        console.log("err in get suppliers:", err);
        return EMPTY;
      }),
    )
    .subscribe((res) => {
      console.log(res);
      this.suppliersList = res
    })
  }

  selectedSupplier(data: IGetSupplier): void {
    this.cancel(data);
  }
  
  cancel(data?: IGetSupplier) {
    this.modalCtrl.dismiss(data);
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

  deleteSupplier(id: number): void {
    console.log("id of del sup",id);
    
    this.expenseDataService.deleteSupplier(id)
    .pipe(
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
}



// export class selectSupplierComponent implements OnInit {

//   searchTerm = '';
//   suppliers: ISuppliers[];
//   // editMode: boolean = false;

//   constructor(private fileService: FilesService, private popoverController: PopoverController) { }
//   ngOnInit() {
//     const token = localStorage.getItem('token');
//     this.fileService.getSuppliersList(token).pipe(
//       catchError((err) => {
//         console.log("somthing went wrong", err.err);
//         return EMPTY;
//       })).subscribe((res) => {
//         console.log("suppliers from server: ", res);
//         this.suppliers =  res;
//         console.log(this.suppliers);
//       })
    
//   }

//   changeSearchTerm(ev: any): void {
//     this.searchTerm = ev.detail.value
//   }

//   selectItem(data: string): void {
//     this.popoverController.dismiss(data);
//   }

//   addSupplier() {
//     from(this.popoverController.create({
//       component: addSupplierComponent,
//       //event: ev,
//       // translucent: false,
//       componentProps: {
//         supplier: this.suppliers 
//       }
//     })).pipe(
//       catchError((err) => {
//         console.log("openAddSupplier failed in create", err);
//         return EMPTY;
//       }),
//       switchMap((popover) => {
//         if (popover) {
//           return from(popover.present()).pipe(
//             switchMap(() => from(popover.onDidDismiss())),
//             catchError((err) => {
//               console.log("openAddSupplier failed in present", err);
//               return EMPTY;
//             })
//             );
//           }
//           else {
//             console.log('Popover modal is null');
//             return EMPTY;
//           }
//         })
//         ).subscribe((res) => {
//           console.log(res.data?.value);
//           this.popoverController.dismiss(res.data?.value);//close the popover of suppliers list
//     })
//   }

//   casualSupplier(): void{
//     this.popoverController.dismiss(this.searchTerm);
//   }

//   editSupplier(supplier: any): void{
//     from(this.popoverController.create({
//       component: addSupplierComponent,
//       //event: ev,
//       // translucent: false,
//       componentProps: {
//         supplier: supplier,
//         editMode: true
//       }
//     })).pipe(
//       catchError((err) => {
//         console.log("openEditSupplier failed in create", err);
//         return EMPTY;
//       }),
//       switchMap((popover) => {
//         if (popover) {
//           return from(popover.present()).pipe(
//             switchMap(() => from(popover.onDidDismiss())),
//             catchError((err) => {
//               console.log("openEditSupplier failed in present", err);
//               return EMPTY;
//             })
//             );
//           }
//           else {
//             console.log('Popover modal is null');
//             return EMPTY;
//           }
//         })
//         ).subscribe((res) => {
//           console.log(res.data?.value);
//           this.popoverController.dismiss(res.data?.value);//close the popover of suppliers list
//     })
    
//   }
// }

