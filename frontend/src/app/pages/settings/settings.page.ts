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

