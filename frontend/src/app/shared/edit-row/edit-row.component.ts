import { Component, Input, OnInit } from '@angular/core';
import { IColumnDataTable, IGetSubCategory, IRowDataTable, ISelectItem } from '../interface';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { FormTypes, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from '../enums';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-transaction-edit',
  templateUrl: './edit-row.component.html',
  styleUrls: ['./edit-row.component.scss'],
})
export class editRowComponent<TFormColumns, TFormHebrewColumns> implements OnInit {

  @Input() data: IRowDataTable;
  @Input() parentForm: FormGroup;
  @Input() fields: IColumnDataTable<TFormColumns, TFormHebrewColumns>[];
  @Input() disabledFields: TFormColumns[];
  listIsEqiupmentCategory: { name: string; value: string; }[];
  listNotEqiupmentCategory: { name: string; value: string; }[];
  combinedListCategory: any;

  constructor(private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService) {}

  ngOnInit() {
    console.log("in edit: ", this.data);
    this.getIsEquipmentCategory();
    this.getNotEquipmentCategory();
  }

  getIsEquipmentCategory(): void {
    this.expenseDataServise.getcategry(true)
      .pipe(
        map((res) => {
          return res.map((item: IGetSubCategory) => ({
            name: item.category,
            value: item.category
          })
          )
        }))
      .subscribe((res) => {
        this.listIsEqiupmentCategory = res;
        console.log("isEquipment: ", this.listIsEqiupmentCategory);
        this.getAllCategory()
      })
  }

  getNotEquipmentCategory(): void {
    this.expenseDataServise.getcategry(false)
      .pipe(
        map((res) => {
          return res.map((item: IGetSubCategory) => ({
            name: item.category,
            value: item.category
          })
          )
        }))
      .subscribe((res) => {
        this.listNotEqiupmentCategory = res;
        console.log("not is equipment: ", this.listNotEqiupmentCategory);
        this.getAllCategory()
      })
  }


  getAllCategory(): void {
    const separator: ISelectItem[] = [{ name: '----- מוגדרות כציוד -----', value: null, disable: true }];
    if (this.listIsEqiupmentCategory && this.listNotEqiupmentCategory) {
      this.combinedListCategory.push(...this.listNotEqiupmentCategory, ...separator, ...this.listIsEqiupmentCategory);
    }
    console.log(this.combinedListCategory);

  }

}
