import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'my-status',
  templateUrl: './my-status.page.html',
  styleUrls: ['./my-status.page.scss'],
})
export class MyStatusPage {
  tabs = [
    { id: 'paymentsStatus', label: 'תשלומים' },
    { id: 'updateDetails', label: 'עדכון פרטים' },
    { id: 'manageCategories', label: 'ניהול קטגוריות' }
  ];

  selectedSection = 'paymentsStatus'; // Default section
  vatReportForm: FormGroup;

  constructor(private formBuilder: FormBuilder) {
    this.vatReportForm = this.formBuilder.group({
      vatableTurnover: new FormControl (
        '', Validators.required,
      ),
      nonVatableTurnover: new FormControl (
        '', Validators.required,
      ),
      year: new FormControl (
        '', Validators.required,
      ),
    })
  }




  onSubmit() {
  }

  showSection(sectionId: string) {
    this.selectedSection = sectionId; // Change the section based on the tab selected
  }
}
