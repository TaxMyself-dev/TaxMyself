import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { InputTextComponent } from "../../components/input-text/input-text.component";
import { InputDateComponent } from "../../components/input-date/input-date.component";
import { InputSelectComponent } from "../../components/input-select/input-select.component";
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { ExpenseFormColumns, inputsSize } from 'src/app/shared/enums';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IRowDataTable, ISelectItem, IUserData } from 'src/app/shared/interface';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.component.html',
  styleUrls: ['./add-expense.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputTextComponent, InputDateComponent, InputSelectComponent]
})
export class AddExpenseComponent implements OnInit {

  authService = inject(AuthService);
  formBuilder = inject(FormBuilder);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;
  expenseFormColumns = ExpenseFormColumns;

  businessList = signal<ISelectItem[]>([]);
  

  initialForm: FormGroup;
  addExpenseForm: FormGroup;
  userData: IUserData;
  


  constructor() { }
  ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData?.isTwoBusinessOwner) {
      // const businessNumberFieldExists = this.columnsList.find(
      //   (column) => column.name === ExpenseFormColumns.BUSINESS_NUMBER
      // );
      // if (!businessNumberFieldExists) {
      //   this.columnsList.push({ // add businessNumber field if not exist
      //     name: ExpenseFormColumns.BUSINESS_NUMBER,
      //     value: ExpenseFormHebrewColumns.businessNumber,
      //     type: this.formTypes.DDL
      //   });
      // }
      this.businessList.set([
        { name: this.userData.businessName, value: this.userData.businessNumber },
        { name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber }
      ]);
      // this.businessList.push({ name: this.userData.businessName, value: this.userData.businessNumber });
      // this.businessList.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
    }
    // this.orderColumns();
    // const today = new Date();
    // this.getCategory();
    this.initForm();
    // this.getSuppliers(); // Use this function only if changing the supplier field to DDL.
  }

  initForm(data?: IRowDataTable): void {
    if (data) {
      // this.getSubCategory(data?.category as string)// // The list is needed for displing subCategory field
    }

    this.addExpenseForm = this.formBuilder.group({
      [ExpenseFormColumns.CATEGORY]: [data?.category || '', Validators.required],
      [ExpenseFormColumns.SUB_CATEGORY]: [data?.subCategory || '', Validators.required],
      [ExpenseFormColumns.SUPPLIER]: [data?.supplier || data?.name || '', Validators.required],
      [ExpenseFormColumns.SUM]: [data?.sum || '', [Validators.required, Validators.pattern(/^\d+$/)]],
      [ExpenseFormColumns.TAX_PERCENT]: [data?.taxPercent || '', [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
      [ExpenseFormColumns.VAT_PERCENT]: [data?.vatPercent || '', [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
      [ExpenseFormColumns.DATE]: ['', Validators.required,],
      [ExpenseFormColumns.NOTE]: [data?.note || ''],
      [ExpenseFormColumns.EXPENSE_NUMBER]: [data?.expenseNumber || '', [Validators.pattern(/^\d+$/)]],
      [ExpenseFormColumns.SUPPLIER_ID]: [data?.supplierID || '', [Validators.pattern(/^\d+$/)]],
      [ExpenseFormColumns.FILE]: [data?.file || File],// TODO: what to show in edit mode
      [ExpenseFormColumns.IS_EQUIPMENT]: [data?.isEquipment || false, Validators.required], // TODO
      [ExpenseFormColumns.REDUCTION_PERCENT]: [data?.reductionPercent || 0, [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
      [ExpenseFormColumns.BUSINESS_NUMBER]: [data?.businessNumber || ''],
    });

    if (this.userData?.isTwoBusinessOwner) {
      this.addExpenseForm?.get('businessNumber').setValidators([Validators.required]);
    }
    // this.initialForm = cloneDeep(this.addExpenseForm);
  }

}
