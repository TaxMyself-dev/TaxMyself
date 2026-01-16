import { Component, OnInit, signal } from '@angular/core';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { FormTypes } from 'src/app/shared/enums';

@Component({
  selector: 'app-clients-dashboard',
  templateUrl: './clients-dashboard.component.html',
  styleUrls: ['./clients-dashboard.component.scss'],
  standalone: false
})
export class ClientsDashboardComponent implements OnInit {
  isLoading = signal<boolean>(false);
  users: any[] = [];
  filteredUsers: any[] = [];
  visibleFeezbackDialog = signal<boolean>(false);
  selectedClient = signal<{ firebaseId: string; name: string } | null>(null);

  columnsTitle: IColumnDataTable<any, any>[] = [
    { name: 'fullName', value: 'שם מלא', type: FormTypes.TEXT },
    { name: 'email', value: 'אימייל', type: FormTypes.TEXT },
    { name: 'phone', value: 'טלפון', type: FormTypes.TEXT },
    { name: 'city', value: 'עיר', type: FormTypes.TEXT },
    { name: 'payStatus', value: 'סטטוס תשלום', type: FormTypes.TEXT },
    { name: 'createdAt', value: 'תאריך רישום', type: FormTypes.DATE },
    { name: 'subscriptionEndDate', value: 'תאריך סיום מנוי', type: FormTypes.DATE },
  ];

  fileActions: ITableRowAction[] = [
    {
      name: 'feezback',
      icon: 'pi pi-cloud-download',
      title: 'טען תנועות מ-Feezback',
      alwaysShow: true, // Show this button even when row has no file
      action: (event: any, row: IRowDataTable) => {
        this.openFeezbackDialog(row);
      }
    }
  ];

  searchTerm: string = '';

  constructor(private adminPanelService: AdminPanelService) {}

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.isLoading.set(true);
    this.adminPanelService.getAllUsers()
      .pipe(
        catchError(err => {
          console.error('Error loading users:', err);
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe(users => {
        this.users = users.map((user: any) => {
          const mappedUser: any = {
            ...user,
            fullName: `${user.fName || ''} ${user.lName || ''}`.trim(),
            payStatus: this.getPayStatusLabel(user.payStatus),
          };
          
          // Ensure dates are properly formatted
          if (user.createdAt) {
            mappedUser.createdAt = new Date(user.createdAt);
          }
          if (user.subscriptionEndDate) {
            mappedUser.subscriptionEndDate = new Date(user.subscriptionEndDate);
          }
          
          return mappedUser;
        });
        this.filteredUsers = [...this.users];
      });
  }

  getPayStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      'TRIAL': 'ניסיון',
      'PAID': 'שולם',
      'PAYMENT_REQUIRED': 'נדרש תשלום',
      'FREE': 'חינם',
    };
    return statusMap[status] || status;
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value || '';
    if (!this.searchTerm) {
      this.filteredUsers = [...this.users];
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredUsers = this.users.filter(user =>
      user.fullName?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term) ||
      user.phone?.includes(term) ||
      user.city?.toLowerCase().includes(term)
    );
  }

  getTotalUsers(): number {
    return this.users?.length || 0;
  }

  getUsersByStatus(status: string): number {
    if (!this.users || this.users.length === 0) {
      return 0;
    }
    return this.users.filter(u => u.payStatus === status).length;
  }

  openFeezbackDialog(row: IRowDataTable): void {
    this.selectedClient.set({
      firebaseId: row['firebaseId'] as string,
      name: row['fullName'] as string || `${row['fName'] || ''} ${row['lName'] || ''}`.trim()
    });
    this.visibleFeezbackDialog.set(true);
  }

  closeFeezbackDialog(event?: { visible: boolean }): void {
    if (event && !event.visible) {
      this.visibleFeezbackDialog.set(false);
      this.selectedClient.set(null);
    } else {
      this.visibleFeezbackDialog.set(false);
      this.selectedClient.set(null);
    }
  }
}

