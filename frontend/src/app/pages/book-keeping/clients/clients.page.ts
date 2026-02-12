import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { DocCreateService } from 'src/app/pages/doc-create/doc-create.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
import {
  BusinessStatus,
  ClientsTableColumns,
  ClientsTableHebrewColumns,
  FormTypes,
} from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';

@Component({
  selector: 'app-clients',
  templateUrl: './clients.page.html',
  styleUrls: ['./clients.page.scss', '../../../shared/shared-styling.scss'],
  standalone: false
})
export class ClientsPage implements OnInit {

  // ===========================
  // Inject services
  // ===========================
  private gs = inject(GenericService);
  private authService = inject(AuthService);
  private docCreateService = inject(DocCreateService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
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
  myClients: any;
  fileActions = signal<ITableRowAction[]>([]);

  // ===========================
  // Table config
  // ===========================
  clientsTableFields: IColumnDataTable<ClientsTableColumns, ClientsTableHebrewColumns>[] = [
    { name: ClientsTableColumns.NAME, value: ClientsTableHebrewColumns.name, type: FormTypes.TEXT },
    { name: ClientsTableColumns.ID, value: ClientsTableHebrewColumns.id, type: FormTypes.TEXT },
    { name: ClientsTableColumns.PHONE, value: ClientsTableHebrewColumns.phone, type: FormTypes.TEXT },
    { name: ClientsTableColumns.EMAIL, value: ClientsTableHebrewColumns.email, type: FormTypes.TEXT },
    { name: ClientsTableColumns.ADDRESS, value: ClientsTableHebrewColumns.address, type: FormTypes.TEXT },
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
      this.fetchClients(this.selectedBusinessNumber());
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
    this.fetchClients(this.selectedBusinessNumber());
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

    this.fetchClients(this.selectedBusinessNumber());
  }

  // ===========================
  // Fetch clients from server
  // ===========================
  fetchClients(businessNumber: string): void {
    console.log("fetchClients →", { businessNumber });

    this.isLoadingDataTable.set(true);

    this.myClients = this.docCreateService
      .getClients(businessNumber)
      .pipe(
        map((clients: any[]) => {
          console.log("👥 Clients fetched:", clients);
          return clients.map(client => ({
            ...client,
            id: client.id || '-',
            phone: client.phone || '-',
            email: client.email || '-',
            address: client.address || '-',
          }));
        }),
        catchError(err => {
          console.error("Error fetching clients:", err);
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
        action: (event: any, row: IRowDataTable) => {
          this.onEditClient(row);
        }
      },
      {
        name: 'delete',
        icon: 'pi pi-trash',
        title: 'מחק',
        action: (event: any, row: IRowDataTable) => {
          this.onDeleteClient(row);
        }
      },
    ]);
  }

  onEditClient(client: IRowDataTable): void {
    // TODO: Implement edit client functionality
    console.log('Edit client:', client);
    this.messageService.add({
      severity: 'info',
      summary: 'עריכה',
      detail: 'פונקציונליות עריכה תתווסף בקרוב',
      life: 3000,
      key: 'br'
    });
  }

  onDeleteClient(client: IRowDataTable): void {
    const clientRowId = (client as any).clientRowId;
    if (!clientRowId) {
      console.error('Client ID not found');
      return;
    }

    this.confirmationService.confirm({
      message: `האם אתה בטוח שברצונך למחוק את הלקוח "${client.name}"?`,
      header: 'מחיקת לקוח',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, מחק',
      rejectLabel: 'ביטול',
      accept: () => {
        this.docCreateService.deleteClient(clientRowId)
          .pipe(
            catchError(err => {
              console.error('Error deleting client:', err);
              this.messageService.add({
                severity: 'error',
                summary: 'שגיאה',
                detail: 'לא הצלחנו למחוק את הלקוח',
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
              detail: 'הלקוח נמחק בהצלחה',
              life: 3000,
              key: 'br'
            });
            // Refresh clients list
            this.fetchClients(this.selectedBusinessNumber());
          });
      },
      reject: () => {
        console.log("User cancelled deletion.");
      }
    });
  }
}

