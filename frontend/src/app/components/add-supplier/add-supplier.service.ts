import { HttpClient, httpResource } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { IClient } from 'src/app/pages/doc-create/doc-create.interface';
import { FormTypes } from 'src/app/shared/enums';
import { IBaseFieldData, ICategory, ISelectItem, ISubCategory, ISupplier } from 'src/app/shared/interface';
import { SupplierKeys } from 'src/app/shared/types';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AddSupplierService {

  private http = inject(HttpClient);

  readonly subCategoriesResource = httpResource<any[]>(() => {
    const selectedCategory = this.$selectedCategory();

    if (!selectedCategory) return undefined;

    return {
      url: `${environment.apiUrl}expenses/get-sub-categories`,
      params: { categoryName: selectedCategory, isExpense: true }, // query string
      method: 'GET',
    };
  });

  $subCategoriesOptions = computed(() => {
    return this.subCategoriesResource.value()?.map((item: ISubCategory) => ({
      name: item.subCategoryName,
      value: item.subCategoryName
    })
    )
  })

  constructor() {
    effect(() => {
      console.log("subCategoriesOptions", this.$subCategoriesOptions());

      this.addSupplierFields.subCategory.enumValues = this.$subCategoriesOptions();
    });
  }

  readonly addSupplierFields: Record<SupplierKeys, IBaseFieldData> = {
    // General Details 
    ['name']: {
      //name: FieldsCreateDocName.typeFile,
      value: 'name',
      labelText: 'שם הספק',
      placeHolder: 'הקלד את שם הספק',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.required]
    },
    ['supplierID']: {
      value: 'supplierID',
      labelText: 'מספר ספק',
      placeHolder: 'מספר ספק',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: []
    },
    ['isEquipment']: {
      value: 'isEquipment',
      labelText: 'האם זה ציוד',
      placeHolder: 'בחר',
      type: FormTypes.DDL,
      initialValue: undefined,
      enumValues: [{ name: 'כן', value: true }, { name: 'לא', value: false }],
      validators: [Validators.required]
    },
    ['category']: {
      value: 'category',
      labelText: 'קטגוריה',
      placeHolder: 'בחר קטגוריה',
      type: FormTypes.DDL,
      initialValue: undefined,
      enumValues: [],
      validators: [Validators.required]
    },
    ['subCategory']: {
      value: 'subCategory',
      labelText: 'תת קטגוריה',
      placeHolder: 'בחר תת קטגוריה',
      type: FormTypes.DDL,
      initialValue: undefined,
      enumValues: [],
      validators: [Validators.required]
    },
    ['taxPercent']: {
      value: 'taxPercent',
      labelText: 'אחוז מס',
      placeHolder: 'אחוז מס',
      type: FormTypes.NUMBER,
      initialValue: '',
      enumValues: [],
      validators: [Validators.min(0), Validators.max(100), Validators.required]
    },
    ['vatPercent']: {
      value: 'vatPercent',
      labelText: 'אחוז מע"מ',
      placeHolder: 'אחוז מע"מ',
      type: FormTypes.NUMBER,
      initialValue: '',
      enumValues: [],
      validators: [Validators.min(0), Validators.max(100), Validators.required]
    },
    ['reductionPercent']: {
      value: 'reductionPercent',
      labelText: 'אחוז פחת',
      placeHolder: 'אחוז פחת',
      type: FormTypes.NUMBER,
      initialValue: '',
      enumValues: [],
      validators: [Validators.min(0), Validators.max(100), Validators.required]
    },
  }

  $selectedCategory = signal<string>("");


  setCategoryEnumValues(options: ISelectItem[] | null | undefined): void {
    this.addSupplierFields.category.enumValues = options ?? [];
  }

  /** 
   * Creates a FormGroup for a new supplier based on addSupplierFields configuration
   * @returns FormGroup with all supplier fields and validators
   */
  createSupplierForm(): FormGroup {
    const formControls: { [key: string]: FormControl } = {};

    // Iterate through all fields and create a FormControl for each
    Object.keys(this.addSupplierFields).forEach((fieldKey) => {
      const fieldData = this.addSupplierFields[fieldKey as SupplierKeys];

      // Create FormControl with initial value and validators
      formControls[fieldKey] = new FormControl(
        fieldData.initialValue,
        fieldData.validators || []
      );
    });

    // Return new FormGroup with all controls
    return new FormGroup(formControls);
  }

  saveSupplierDetails(data: Partial<ISupplier>): Observable<any> {
    const url = `${environment.apiUrl}expenses/add-supplier`;
    return this.http.post<Partial<ISupplier>>(url, data);
  }

}


