import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { IColumnDataTable } from '../interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes } from '../enums';

@Component({
  selector: 'app-add-transaction',
  templateUrl: './add-transaction.component.html',
  styleUrls: ['./add-transaction.component.scss'],
})
export class AddTransactionComponent  implements OnInit {

  columns: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [ // Titles of expense// TODO: what? why is this here? should be generic??
    { name: ExpenseFormColumns.IS_EQUIPMENT, value: ExpenseFormHebrewColumns.isEquipment, type: FormTypes.DDL },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
  ];
  existCategory: boolean = true;
  existCategoryForm: FormGroup;
  readonly formTypes = FormTypes;

  constructor(private expenseDataServise: ExpenseDataService, private formBuilder: FormBuilder) { 
    this.existCategoryForm = this.formBuilder.group({
      oneTimeTransaction : new FormControl(
        false, [Validators.required,]
      ),
      category : new FormControl(
        '', [Validators.required,]
      ),
      subCategory : new FormControl(
        '', [Validators.required,]
      ), 
      isEquipment : new FormControl(
        false, [Validators.required,]
      ),
    })
  }

  ngOnInit() {
    // this.expenseDataServise.getcategry
  }

  clicked(event): void {
    const choose = event.target.value;
    console.log("click");
    console.log(event);
    choose === "new" ? this.existCategory = false : this.existCategory = true;
  }

  onDdlSelectionChange(event, colData: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>) {
    console.log("event: ", event);
    console.log("colData: ", colData);
    
    switch (colData.name) {
      // case ExpenseFormColumns.IS_EQUIPMENT:
      //   console.log("in equipment");
      //   this.setValueEquipment(event);
      //   break;
      // case ExpenseFormColumns.CATEGORY:
      //   this.getSubCategory(event.detail.value).
      //   pipe(
      //     tap((res) => {this.subCategoryList = res})
      //     ).subscribe();
      //   break;
      // case ExpenseFormColumns.SUB_CATEGORY:
      //   const subCategoryDetails = this.subCategoryList.find(item => item.subCategory === event.detail.value);
      //   this.selectedSubcategory(subCategoryDetails);
      //   break;
      // case ExpenseFormColumns.SUPPLIER:
      //   const supplierDetails = this.suppliersList.find((supplier => supplier.name === event.detail.value));
      //   console.log(supplierDetails);
      //   this.selectedSupplier(supplierDetails)
      //   break;
    }
  }

  getListOptionsByKey(key: ExpenseFormColumns): any {
    console.log("key:", key);
    
    // switch (key) {
    //   case ExpenseFormColumns.IS_EQUIPMENT:
    //     return this.equipmentList;
    //   case ExpenseFormColumns.CATEGORY:
    //     return this.getListCategory();
    //   case ExpenseFormColumns.SUB_CATEGORY:
    //     return this.getListSubCategory();
    //   case ExpenseFormColumns.SUPPLIER:
    //     // this.temp();
    //     return this.suppliersList;
    //     break
    //   default:
    //     return [];
    // }
  }
}
