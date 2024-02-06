import { Component, OnInit } from '@angular/core';
import { PopoverController } from '@ionic/angular';
import { EMPTY, catchError, finalize, from, switchMap } from 'rxjs';
import { addSupplierComponent } from '../add-supplier/add-supplier.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { cloneDeep } from 'lodash';
import { FilesService } from 'src/app/services/files.service';


@Component({
  selector: 'app-select-supplier',
  templateUrl: './select-supplier.component.html',
  styleUrls: ['./select-supplier.component.scss'],
})
export class selectSupplierComponent implements OnInit {

  searchTerm = '';
  suppliers: {};

  constructor(private fileService: FilesService, private http: HttpClient, private popoverController: PopoverController) { }
  ngOnInit() {
    const token = localStorage.getItem('token');
    this.fileService.getSuppliersList(token).pipe(
      catchError((err) => {
        console.log("somthing went wrong", err.err);
        return EMPTY;
      })).subscribe((res) => {
        console.log("suppliers from server: ", res);
        this.suppliers = cloneDeep(res)
      })
    
  }

  changeSearchTerm(ev: any): void {
    this.searchTerm = ev.detail.value
  }

  selectItem(data: string): void {
    this.popoverController.dismiss(data);
  }

  addSupplier() {
    from(this.popoverController.create({
      component: addSupplierComponent,
      //event: ev,
      // translucent: false,
      componentProps: {
      }
    })).pipe(
      catchError((err) => {
        console.error("openAddSupplier failed in create", err);
        return EMPTY;
      }),
      switchMap((popover) => {
        if (popover) {
          return from(popover.present()).pipe(
            switchMap(() => from(popover.onDidDismiss())),
            catchError((err) => {
              console.error("openAddSupplier failed in present", err);
              return EMPTY;
            })
            );
          }
          else {
            console.error('Popover modal is null');
            return EMPTY;
          }
        })
        ).subscribe((res) => {
          console.log(res.data?.value);
          this.popoverController.dismiss(res.data?.value);//close the popover of suppliers list
    })
  }

  casualSupplier(): void{
    this.popoverController.dismiss(this.searchTerm);
  }

  editSupplier(): void{
    console.log("edit suppluer clicked!");
    
  }
}

