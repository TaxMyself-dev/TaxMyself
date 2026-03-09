import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
import {
  BusinessStatus,
  FormTypes,
} from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { AddSupplierComponent } from 'src/app/components/add-supplier/add-supplier.component';

@Component({
  selector: 'app-suppliers',
  templateUrl: './suppliers.page.html',
  styleUrls: ['./suppliers.page.scss', '../../../shared/shared-styling.scss'],
  standalone: false
})
export class SuppliersPage implements OnInit {

  // ===========================
  // Inject services
  // ===========================
  private gs = inject(GenericService);
  private authService = inject(AuthService);
  private expenseDataService = inject(ExpenseDataService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private dialogService = inject(DialogService);
  private fb = inject(FormBuilder);

  // ===========================
  // Global state
  // ===========================
  userData!: IUserData;

  // Business related
  selectedBusinessNumber = signal<string>("");
  selectedBusinessName = signal<string>("");
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
  businessOptions = this.gs.businessSelectItems;

  isLoadingDataTable = signal<boolean>(false);
  mySuppliers: any;
  fileActions = signal<ITableRowAction[]>([]);

  // ===========================
  // Table config
  // ===========================
  suppliersTableFields: IColumnDataTable<string, string>[] = [
    { name: 'supplier', value: 'שם הספק', type: FormTypes.TEXT },
    { name: 'supplierID', value: 'מספר ספק', type: FormTypes.TEXT },
    { name: 'category', value: 'קטגוריה', type: FormTypes.TEXT },
    { name: 'subCategory', value: 'תת קטגוריה', type: FormTypes.TEXT },
    { name: 'taxPercent', value: 'אחוז מוכר למס', type: FormTypes.TEXT },
    { name: 'vatPercent', value: 'אחוז מוכר למע"מ', type: FormTypes.TEXT },
  ];

  // ===========================
  // Filter config (used by FilterTab)
  // ===========================
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];

  // ===========================
  // Init
  // ===========================
  async ngOnInit() {
    this.setFileActions();

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();
    this.selectedBusinessNumber.set(businesses[0].businessNumber);
    this.selectedBusinessName.set(businesses[0].businessName);

    // Create the form with essential controls early
    this.form = this.fb.group({
      businessNumber: [this.selectedBusinessNumber()],
    });

    this.form.get('businessNumber')?.valueChanges.subscribe(businessNumber => {
      if (!businessNumber) return;

      const business = this.gs.businesses().find(
        b => b.businessNumber === businessNumber
      );

      this.selectedBusinessNumber.set(business?.businessNumber ?? '');
      this.selectedBusinessName.set(business?.businessName ?? '');

      // Auto-fetch when business changes
      this.fetchSuppliers(this.selectedBusinessNumber());
    });

    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.gs.businessSelectItems,
        defaultValue: this.selectedBusinessNumber()
      },
    ];

    // Fetch initial data
    this.fetchSuppliers(this.selectedBusinessNumber());
  }

  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {
    console.log("Submitted filter:", formValues);
    this.selectedBusinessNumber.set(formValues.businessNumber);
    
    const business = this.gs.businesses().find(
      b => b.businessNumber === formValues.businessNumber
    );
    
    if (business) {
      this.selectedBusinessName.set(business.businessName);
    }

    this.fetchSuppliers(this.selectedBusinessNumber());
  }

  // ===========================
  // Fetch suppliers from server
  // ===========================
  fetchSuppliers(businessNumber: string): void {
    console.log("fetchSuppliers →", { businessNumber });

    this.isLoadingDataTable.set(true);

    // Set active business number for the API call (via interceptor)
    this.authService.setActiveBusinessNumber(businessNumber);

    this.mySuppliers = this.expenseDataService
      .getAllSuppliers()
      .pipe(
        map((suppliers: any[]) => {
          console.log("👥 Suppliers fetched:", suppliers);
          return suppliers.map((supplier, index) => ({
            ...supplier,
            id: supplier.id || index, // Use index as fallback if id is missing
            supplier: supplier.supplier || '-',
            supplierID: supplier.supplierID || '-',
            category: supplier.category || '-',
            subCategory: supplier.subCategory || '-',
            taxPercent: supplier.taxPercent != null ? `${supplier.taxPercent}%` : '-',
            vatPercent: supplier.vatPercent != null ? `${supplier.vatPercent}%` : '-',
            reductionPercent: supplier.reductionPercent != null ? `${supplier.reductionPercent}%` : '-',
            isEquipment: supplier.isEquipment === true ? 'כן' : 'לא',
          }));
        }),
        catchError(err => {
          console.error("Error fetching suppliers:", err);
          // Return empty array as Observable to show empty state
          return of([]);
        }),
        finalize(() => this.isLoadingDataTable.set(false))
      );
  }

  private setFileActions(): void {
    this.fileActions.set([
      {
        name: 'edit',
        icon: 'pi pi-pencil',
        title: 'ערוך',
        alwaysShow: true,
        action: (event: any, row: IRowDataTable) => {
          this.onEditSupplier(row);
        }
      },
      {
        name: 'delete',
        icon: 'pi pi-trash',
        title: 'מחק',
        alwaysShow: true,
        action: (event: any, row: IRowDataTable) => {
          this.onDeleteSupplier(row);
        }
      },
    ]);
  }

  onEditSupplier(supplier: IRowDataTable): void {
    this.expenseDataService.getcategry(false, true).subscribe((cats) => {
      const categories = (cats ?? []).map((c: any) => ({ name: c.categoryName ?? c.name, value: c.categoryName ?? c.name }));
      const ref = this.dialogService.open(AddSupplierComponent, {
        header: 'עריכת ספק',
        width: 'min(1100px, 95vw)',
        contentStyle: { minHeight: '400px', overflow: 'visible' },
        rtl: true,
        closable: true,
        dismissableMask: true,
        modal: true,
        data: {
          supplier: supplier as any,
          categories,
          suppliers: [],
          editMode: true,
          businessNumber: this.selectedBusinessNumber()
        }
      });
      ref.onClose.subscribe(() => {
        this.fetchSuppliers(this.selectedBusinessNumber());
      });
    });
  }

  onDeleteSupplier(supplier: IRowDataTable): void {
    const supplierId = (supplier as any).id;
    if (!supplierId) {
      console.error('Supplier ID not found');
      return;
    }

    const supplierName = (supplier as any).supplier || 'הספק';
    
    this.confirmationService.confirm({
      message: `האם אתה בטוח שברצונך למחוק את הספק "${supplierName}"?`,
      header: 'מחיקת ספק',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, מחק',
      rejectLabel: 'ביטול',
      accept: () => {
        this.expenseDataService.deleteSupplier(supplierId)
          .pipe(
            catchError(err => {
              console.error('Error deleting supplier:', err);
              this.messageService.add({
                severity: 'error',
                summary: 'שגיאה',
                detail: 'לא הצלחנו למחוק את הספק',
                life: 3000,
                key: 'br'
              });
              return EMPTY;
            })
          )
          .subscribe(() => {
            this.messageService.add({
              severity: 'success',
              summary: 'הצלחה',
              detail: 'הספק נמחק בהצלחה',
              life: 3000,
              key: 'br'
            });
            // Refresh suppliers list
            this.fetchSuppliers(this.selectedBusinessNumber());
          });
      },
      reject: () => {
        console.log("User cancelled deletion.");
      }
    });
  }
}

