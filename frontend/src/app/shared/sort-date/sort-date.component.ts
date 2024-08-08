import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators} from '@angular/forms';
import { DateService } from 'src/app/services/date.service';


@Component({
  selector: 'app-sort-date',
  templateUrl: './sort-date.component.html',
  styleUrls: ['./sort-date.component.scss', '../search-bar/search-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortDateComponent implements OnChanges {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() errorText: string;
  @Input() minDate: string;
  @Input() set customMaxDate(val: string) {
    this.maxDate = val;
  }
  @Input() set inputLabel(val: string) {
    this.inputLabelName = val;
  }

  RequiredErrorMessage = "שדה זה הוא חובה";
  invalidDateErrorMessage = "התאריך שבחרת אינו תקני";
  errorMessage: string;
  inputLabelName: string;
  maxDate: string;

  constructor(private dateService: DateService) {
    this.maxDate = this.dateService.getTodaysDate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.errorText) {
      this.errorMessage = this.isRequired() ? this.errorText ?? this.RequiredErrorMessage : this.errorText;
    }
    if (changes.inputLabel || changes.controlName) {
      this.inputLabelName = this.isRequired() ? this.inputLabelName + ' *' : this.inputLabelName;
    }
  }
  
  get errorMessageToDisplay(): string {
    return this.isDateValid() ? this.invalidDateErrorMessage : this.errorMessage;
  }

  currentFormControl(): FormControl {
    return this.parentForm && this.controlName ? this.parentForm.get(this.controlName) as FormControl: null;
  }

  isRequired(): boolean {
    return !!this.currentFormControl()?.hasValidator(Validators.required);
  }

  isDateValid(): boolean {
    return true; // TODO
  }


  // readonly doubleMonths: IMonthData[] = [
  //   { name: 'ינואר - פברואר', value: [1, 2] },
  //   { name: 'מרץ - אפריל', value: [3, 4] },
  //   { name: 'מאי - יוני', value: [5, 6] },
  //   { name: 'יולי - אוגוסט', value: [7, 8] },
  //   { name: 'ספטמבר - אוקטובר', value: [9, 10] },
  //   { name: 'נובמבר - דצמבר', value: [11, 12] },
  // ];
  // readonly singleMonths: IMonthData[] = [
  //   { name: 'ינואר', value: [1] },
  //   { name: 'פברואר', value: [2] },
  //   { name: 'מרץ', value: [3] },
  //   { name: 'אפריל', value: [4] },
  //   { name: 'מאי', value: [5] },
  //   { name: 'יוני', value: [6] },
  //   { name: 'יולי', value: [7] },
  //   { name: 'אוגוסט', value: [8] },
  //   { name: 'ספטמבר', value: [9] },
  //   { name: 'אוקטובר', value: [10] },
  //   { name: 'נובמבר', value: [11] },
  //   { name: 'דצמבר', value: [12] },

  // ];
  // readonly years: number[] = Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i);


  // Array of years. @length: the number of years that will be displayed.

  // oneMonth$ = new BehaviorSubject<boolean>(false); //Subject to choose if report on one or two months.
  // dateData: ISortDate = {};

  //Func of checkbox.Updates the variable oneMonth if selected or not.
  // onCheckboxChange(event: any) {
  //   this.oneMonth$.next(event.detail.checked);
  // };

  // saveValue(event: any, type: string) {
  //   switch (type) {
  //     case 'month':
  //       this.dateData.month = event.detail.value;
  //       break;
  //     case 'year':
  //       this.dateData.year = event.detail.value;
  //       break;
  //   }
  // }

  // Func of button confirm.
  // confirm() {
    // this.onSubmit.emit(this.dateData);
    //this.dateData
    // const formData = this.myForm.value;
    // console.log(formData);
    // this.vatReportService.setvatReportData(formData);//Set incomes.
    // //Receives the data according to the selected months and display them.
    // this.vatReportData$ = this.vatReportService.getVatReportdata().pipe(
    //   map(data => {
    //     return {
    //       'עסקאות חייבות לפני מע"מ': data.transactionVAT,
    //       'עסקאות פטורות ממע"מ או בשיעור 0': data.transactionFreeVAT,
    //       'מע"מ הכנסות': data.transactionVAT * 0.17,
    //       'החזר מע"מ רכוש קבוע:': data.equipmentVatRefund,
    //       'החזר מע"מ הוצאות משתנות': data.generalVatRefund,
    //       'מע"מ הכנסות:': 1236,
    //       'תשלום מע"מ': 1236
    //     }
    //   })
    // )
  // }
}
