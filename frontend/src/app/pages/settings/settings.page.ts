import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { IUserData, Business } from 'src/app/shared/interface';
import { AvatarModule } from 'primeng/avatar';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { BusinessType, BusinessTypeLabels, FamilyStatus, FamilyStatusLabels, EmploymentType, EmploymentTypeLabels } from 'src/app/shared/enums';
import { familyStatusOptionsList, employmentTypeOptionsList } from 'src/app/shared/enums';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss', '../../shared/shared-styling.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    AvatarModule,
    ToastModule
  ],
  providers: [MessageService]
})
export class SettingsPage implements OnInit {
  authService = inject(AuthService);
  genericService = inject(GenericService);
  messageService = inject(MessageService);

  userData: IUserData | null = null;
  businesses = signal<Business[]>([]);
  /** ערך בזמן עריכה לפני שמירה */
  advanceTaxEdit: Record<string, number | null> = {};
  savingBusinessNumber = signal<string | null>(null);
  savingPersonal = signal<boolean>(false);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  familyStatusOptions = familyStatusOptionsList;
  employmentTypeOptions = employmentTypeOptionsList;

  personalForm = {
    fName: '',
    lName: '',
    id: '',
    email: '',
    phone: '',
    dateOfBirth: '' as string,
    city: '',
    familyStatus: '' as string,
    employmentStatus: '' as string
  };

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.initPersonalFormFromUserData();
    this.loadBusinesses();
  }

  private initPersonalFormFromUserData(): void {
    const u = this.userData;
    if (!u) return;
    this.personalForm.fName = u.fName ?? '';
    this.personalForm.lName = u.lName ?? '';
    this.personalForm.id = u.id ?? '';
    this.personalForm.email = u.email ?? '';
    this.personalForm.phone = u.phone ?? '';
    this.personalForm.dateOfBirth = this.toInputDate(u.dateOfBirth) ?? '';
    this.personalForm.city = u.city ?? '';
    this.personalForm.familyStatus = u.familyStatus ?? '';
    this.personalForm.employmentStatus = u.employmentStatus ?? '';
  }

  /** Convert date to yyyy-mm-dd for input[type="date"] */
  private toInputDate(val: string | null | undefined): string | null {
    if (val == null || val === '') return null;
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  updatePersonalDetails(): void {
    this.savingPersonal.set(true);
    const payload = {
      fName: this.personalForm.fName?.trim() || undefined,
      lName: this.personalForm.lName?.trim() || undefined,
      id: this.personalForm.id?.trim() || undefined,
      email: this.personalForm.email?.trim() || undefined,
      phone: this.personalForm.phone?.trim() || undefined,
      dateOfBirth: this.personalForm.dateOfBirth || undefined,
      city: this.personalForm.city?.trim() || undefined,
      familyStatus: this.personalForm.familyStatus || undefined,
      employmentStatus: this.personalForm.employmentStatus || undefined
    };
    this.authService.updateUser(payload).subscribe({
      next: () => {
        this.authService.restoreUserData().subscribe({
          next: () => {
            this.userData = this.authService.getUserDataFromLocalStorage();
            this.savingPersonal.set(false);
            this.messageService.add({
              severity: 'success',
              summary: 'הצלחה',
              detail: 'הפרטים עודכנו בהצלחה',
              life: 3000,
              key: 'br'
            });
          },
          error: () => {
            this.savingPersonal.set(false);
            this.messageService.add({
              severity: 'error',
              summary: 'שגיאה',
              detail: 'לא ניתן לרענן את הנתונים',
              life: 3000,
              key: 'br'
            });
          }
        });
      },
      error: () => {
        this.savingPersonal.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן לעדכן את הפרטים. נסה שוב מאוחר יותר.',
          life: 3000,
          key: 'br'
        });
      }
    });
  }

  loadBusinesses(): void {
    this.genericService.loadBusinessesFromServer().then(() => {
      this.businesses.set(this.genericService.businesses());
    });
  }

  getAdvanceTaxDisplay(business: Business): string | number {
    const num = business.businessNumber ?? '';
    if (this.advanceTaxEdit[num] !== undefined && this.advanceTaxEdit[num] !== null) {
      return this.advanceTaxEdit[num] as number;
    }
    return business.advanceTaxPercent ?? '';
  }

  setAdvanceTaxEdit(businessNumber: string | null, event: Event): void {
    if (!businessNumber) return;
    const val = (event.target as HTMLInputElement).value;
    const num = val === '' ? null : Number(val);
    this.advanceTaxEdit[businessNumber] = num;
  }

  async saveAdvanceTax(business: Business): Promise<void> {
    const num = business.businessNumber ?? '';
    const value = this.advanceTaxEdit[num] ?? business.advanceTaxPercent;
    if (value == null) return;
    const percent = Number(value);
    if (isNaN(percent) || percent < 0 || percent > 100) return;
    this.savingBusinessNumber.set(num);
    try {
      await this.genericService.updateBusinessAdvanceTaxPercent(num, percent);
      delete this.advanceTaxEdit[num];
      this.businesses.set(this.genericService.businesses());
    } finally {
      this.savingBusinessNumber.set(null);
    }
  }

  getBusinessTypeLabel(businessType: string | null): string {
    if (!businessType) return '-';
    return BusinessTypeLabels[businessType as BusinessType] || businessType;
  }

  getFamilyStatusLabel(familyStatus: string | null): string {
    if (!familyStatus) return '-';
    return FamilyStatusLabels[familyStatus as FamilyStatus] || familyStatus;
  }

  getEmploymentStatusLabel(employmentStatus: string | null): string {
    if (!employmentStatus) return '-';
    return EmploymentTypeLabels[employmentStatus as EmploymentType] || employmentStatus;
  }

  formatDateOfBirth(dateOfBirth: string | null | undefined): string {
    if (!dateOfBirth) return '-';
    
    // Handle different date formats
    let date: Date;
    
    // Check if it's already in YYYY-MM-DD format
    if (typeof dateOfBirth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      const [year, month, day] = dateOfBirth.split('-');
      date = new Date(Number(year), Number(month) - 1, Number(day));
    } else {
      // Try to parse as Date
      date = new Date(dateOfBirth);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateOfBirth; // Return original if parsing failed
    }
    
    // Format as dd-mm-yyyy
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}-${month}-${year}`;
  }
}

