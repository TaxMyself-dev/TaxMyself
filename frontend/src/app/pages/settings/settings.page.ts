import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { IUserData, Business } from 'src/app/shared/interface';
import { AvatarModule } from 'primeng/avatar';
import { BusinessType, BusinessTypeLabels, FamilyStatus, FamilyStatusLabels, EmploymentType, EmploymentTypeLabels } from 'src/app/shared/enums';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss', '../../shared/shared-styling.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    AvatarModule
  ]
})
export class SettingsPage implements OnInit {
  authService = inject(AuthService);
  genericService = inject(GenericService);

  userData: IUserData | null = null;
  businesses = signal<Business[]>([]);
  /** ערך בזמן עריכה לפני שמירה */
  advanceTaxEdit: Record<string, number | null> = {};
  savingBusinessNumber = signal<string | null>(null);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.loadBusinesses();
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

  shareWithAccountant(): void {
    // TODO: Implement share with accountant functionality
    console.log('Share with accountant clicked');
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

