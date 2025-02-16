import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { IPnlReportData, ISelectItem, IUserDate } from 'src/app/shared/interface';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, map, tap, throwError } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { ReportingPeriodType } from 'src/app/shared/enums';


@Component({
  selector: 'app-uniform-file',
  templateUrl: './uniform-file.page.html',
  styleUrls: ['./uniform-file.page.scss', '../../shared/shared-styling.scss'],
})
export class UniformFilePage implements OnInit {

  uniformFileForm: FormGroup;
  pnlReport: IPnlReportData;
  userData: IUserDate;
  displayExpenses: boolean = false;
  isLoading: boolean = false;
  reportClick: boolean = true;
  startDate: string;
  endDate: string;
  totalExpense: number = 0;
  businessNames: ISelectItem[] = [];

  reportingPeriodType = ReportingPeriodType;

  constructor(private formBuilder: FormBuilder, public authService: AuthService, private fileService: FilesService) {
    this.uniformFileForm = this.formBuilder.group({
      startDate: new FormControl(
        Date,
      ),
      endDate: new FormControl(
        Date,
      ),
      businessNumber: new FormControl(
        '',
      ),
    })
  }


  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData.isTwoBusinessOwner) {
      this.businessNames.push({ name: this.userData.businessName, value: this.userData.businessNumber });
      this.businessNames.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
      this.uniformFileForm.get('businessNumber')?.setValidators([Validators.required]);
    }
    else {
      this.uniformFileForm.get('businessNumber')?.patchValue(this.userData.id);
    }
  }


  onSubmit() {    
    const formData = this.uniformFileForm.value;
    this.reportClick = false;
    //this.createUniformFile(formData.startDate, formData.endDate);
    const businessNumber = this.authService.getUserBussinesNumber();
    this.createUniformFile(formData.startDate, formData.endDate, businessNumber);
  }


  createUniformFile(startDate: string, endDate: string, businessNumber: string) {    
    this.fileService.createUniformFile(startDate, endDate, businessNumber).subscribe({
      next: (response) => {
  
        // Create a Blob from the response
        const blob = new Blob([response], { type: 'application/zip' });
  
        // Create a download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OPENFORMAT.zip`;
  
        // Trigger file download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error("Error downloading ZIP file:", error);
        alert(`Error: ${error.message || "Failed to download the ZIP file"}`);
      }
    });
  }


}
