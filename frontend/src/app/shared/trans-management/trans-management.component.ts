import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { GenericService } from 'src/app/services/generic.service';

@Component({
    selector: 'app-trans-management',
    templateUrl: './trans-management.component.html',
    styleUrls: ['./trans-management.component.scss'],
    standalone: false
})
export class TransManagementComponent  implements OnInit {

  fisiteDataForm: FormGroup;


  constructor(private genericService: GenericService, private formBuilder: FormBuilder, private adminPanelService: AdminPanelService) { 
    this.fisiteDataForm = this.formBuilder.group({
      startDate: new FormControl(
        '', Validators.required,
      ),
      endDate: new FormControl(
        '', Validators.required,
      ),
      finsiteId: new FormControl(
        '', [],
      ),
     })
  }

  ngOnInit() {}



  getTransFromApi(): void {
    this.genericService.getLoader().subscribe();
    const formData = this.fisiteDataForm.value;
    console.log(formData);
    this.adminPanelService.getTransFromApi(formData)
    .pipe(
      finalize(() => this.genericService.dismissLoader()),
      catchError((error) => {
        console.log("error in get trans from api: ", error);
        return EMPTY;
      })
    )
    .subscribe((res) => {
      console.log("res of get trans from api: ", res);
    })
  }

  getAllUsersDataFromFinsite(): void {
    this.genericService.getLoader().subscribe();
    this.adminPanelService.getAllUsersDataFromFinsite()
    .pipe(
      finalize(() => this.genericService.dismissLoader()),
      catchError((error) => {
        console.log("error in getAllUsersDataFromFinsite: ", error);
        return EMPTY;
      })
    )
    .subscribe((res) => {
      console.log(res);
    })
  }
}
