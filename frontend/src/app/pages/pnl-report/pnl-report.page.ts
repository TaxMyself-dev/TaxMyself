import { Component, OnInit } from '@angular/core';
import { PnLReportService } from './pnl-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ISelectItem } from 'src/app/shared/interface';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';


@Component({
  selector: 'app-pnl-report',
  templateUrl: './pnl-report.page.html',
  styleUrls: ['./pnl-report.page.scss', '../../shared/shared-styling.scss'],
})
export class PnLReportPage implements OnInit {

  pnlReportForm: FormGroup;
  pnlReport?: any;
  userData: any = {};
  displayExpenses: boolean = false;
  reportClick: boolean = true;
  messageToast: string;
  isToastOpen: boolean;
  startDate: string;
  endDate: string;
  totalExpense: string | number;
  businessNames: ISelectItem[] = [];

  constructor(public pnlReportService: PnLReportService, private formBuilder: FormBuilder, private dateService: DateService, public authService: AuthService, private genericService: GenericService) {
    this.pnlReportForm = this.formBuilder.group({
      month: new FormControl(
        '', Validators.required,
      ),
      year: new FormControl(
        '', Validators.required,
      ),
      reportingPeriodType: new FormControl(
        '', Validators.required,
      ),
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
      this.businessNames.push({name: this.userData.businessName, value: this.userData.businessNumber});
      this.businessNames.push({name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber});
      this.pnlReportForm.get('businessNumber')?.setValidators([Validators.required]);
    }
    else {      
      this.pnlReportForm.get('businessNumber')?.patchValue(this.userData.id);
    }
  }

  onSubmit() {
    const formData = this.pnlReportForm.value;
    this.reportClick = false;
    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, formData.startDate, formData.endDate);
    this.startDate = startDate;
    this.endDate = endDate;
    this.getPnLReportData(startDate, endDate,formData.businessNumber);
  }


  getPnLReportData(startDate: string, endDate: string, businessNumber: string) {

    this.pnlReportService.getPnLReportData(startDate, endDate, businessNumber)
      .subscribe((res) => {
        this.pnlReport = res;
        this.pnlReport.income = this.genericService.addComma(this.pnlReport.income);
        this.pnlReport.netProfitBeforeTax = this.genericService.addComma(this.pnlReport.netProfitBeforeTax);
        this.totalExpense = 0;
        for (const expense of this.pnlReport.expenses) {
          this.totalExpense += expense.total;
        }
        this.totalExpense = this.genericService.addComma(this.totalExpense);
      });

  }


  updateIncome(event: any) {    
    this.pnlReport.netProfitBeforeTax = event.detail.value - Number(this.totalExpense);
  }


  showExpenses() {
    this.displayExpenses = !this.displayExpenses
  }


  setCloseToast(): void {
    this.isToastOpen = false;
  }


}