import { KeyValuePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { catchError, EMPTY } from 'rxjs';
import { FormTypes, inputsSize } from 'src/app/shared/enums';
import { IColumnDataTable, ISelectItem, ISupplier } from 'src/app/shared/interface';
import { SupplierKeys, SupplierValues } from 'src/app/shared/types';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { GenericTableComponent } from "../generic-table/generic-table.component";
import { InputSelectComponent } from '../input-select/input-select.component';
import { InputTextComponent } from "../input-text/input-text.component";
import { AddSupplierService } from './add-supplier.service';

// !! ATTENTION !!
// We have stopped development of this feature near completion. 
// We need to decide on the logic of which fields must be added when saving a new supplier
// and the ability to edit a supplier.


@Component({
  selector: 'app-add-supplier',
  templateUrl: './add-supplier.component.html',
  styleUrls: ['./add-supplier.component.scss'],
  standalone: true,
  imports: [KeyValuePipe, GenericTableComponent, InputTextComponent, ReactiveFormsModule, ButtonComponent, InputSelectComponent],
  providers: [AddSupplierService]
})
export class AddSupplierComponent {
  addSupplierService = inject(AddSupplierService);
  messageService = inject(MessageService);
  dialogRef = inject(DynamicDialogRef);
  dialogConfig = inject(DynamicDialogConfig);

  categories = signal<ISelectItem[]>(this.dialogConfig.data?.categories ?? []);

  inputSize = inputsSize;
  buttonColor = ButtonColor;
  buttonSize = ButtonSize;
  formTypes = FormTypes;

  addSupplierForm = this.addSupplierService.createSupplierForm();

  subCategories = computed(() => this.addSupplierService.$subCategoriesOptions());

  // Preserve original order for keyvalue pipe (prevents alphabetical sorting)
  preserveOrder = () => 0;

  suppliersTableFields: IColumnDataTable<SupplierKeys, SupplierValues>[] = [
    { name: 'name', value: 'שם הספק', type: FormTypes.TEXT },
    { name: 'supplierID', value: 'מספר ספק', type: FormTypes.TEXT },
    { name: 'category', value: 'קטגוריה', type: FormTypes.TEXT },
    { name: 'subCategory', value: 'תת קטגוריה', type: FormTypes.TEXT },
    { name: 'taxPercent', value: 'אחוז מס', type: FormTypes.TEXT },
    { name: 'vatPercent', value: 'אחוז מע"מ', type: FormTypes.TEXT },
  ];

  suppliers = signal<ISupplier[]>(this.dialogConfig.data?.suppliers ?? []);

  constructor() {
    this.addSupplierService.setCategoryEnumValues(this.categories());
  }

  saveSupplier() {
    const raw = this.addSupplierForm.getRawValue() as Partial<ISupplier>;

    const supplierData = Object.entries(raw).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        (acc as any)[key] = trimmed === '' ? null : trimmed;
        return acc;
      }
      (acc as any)[key] = value ?? null;
      return acc;
    }, {} as Partial<ISupplier>);

    this.addSupplierService.saveSupplierDetails(supplierData)
      .pipe(
        catchError((err) => {
          console.log("err in save supplier: ", err);
          if (err.status === 409) {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: "כבר קיים ספק בשם זה, אנא בחר שם שונה. אם ברצונך לערוך ספק זה אנא  לחץ על כפתור עריכה דרך הרשימה .",
              life: 3000,
              sticky: true,
              key: 'br'
            })
          }
          else {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: "אירעה שגיאה לא ניתן לשמור ספק אנא נסה מאוחר יותר!",
              life: 3000,
              sticky: true,
              key: 'br'
            })
          }
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("res in save supplier: ", res);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: "ספק נשמר בהצלחה!",
          life: 3000,
          key: 'br'
        })
        this.cancel(supplierData)
      })
  }

  cancel(data?: Partial<ISupplier>) {
    this.dialogRef.close(data);
  }

  onSelectionChange(event: string | boolean, key: string) {
    console.log("🚀 ~ AddSupplierComponent ~ onSelectionChange ~ key:", key)
    console.log("event: ", event);
    if (key === 'category') {
      this.addSupplierService.$selectedCategory.set(event as string);
    }
    if (key === 'subCategory') {
      // this.addSupplierService.$selectedCategory.set(event);
    }
  }
}
