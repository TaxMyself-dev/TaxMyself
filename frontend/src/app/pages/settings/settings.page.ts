import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { MyPermissionsService } from 'src/app/services/my-permissions.service';
import { IUserData, Business, IChild } from 'src/app/shared/interface';
import { AvatarModule } from 'primeng/avatar';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SelectModule } from 'primeng/select';
import { familyStatusOptionsList, employmentTypeOptionsList, businessTypeOptionsList, paymentIdentifierType, VATReportingType, TaxReportingType } from 'src/app/shared/enums';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { SharedModule } from 'src/app/shared/shared.module';

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
    ToastModule,
    DialogModule,
    ConfirmDialogModule,
    SelectModule,
    SharedModule
  ],
  providers: [MessageService, ConfirmationService]
})
export class SettingsPage implements OnInit {
  authService = inject(AuthService);
  genericService = inject(GenericService);
  messageService = inject(MessageService);
  confirmationService = inject(ConfirmationService);
  myPermissionsService = inject(MyPermissionsService);
  transactionsService = inject(TransactionsService);

  userData: IUserData | null = null;
  businesses = signal<Business[]>([]);
  children = signal<IChild[]>([]);
  /** ערך בזמן עריכה לפני שמירה */
  advanceTaxEdit: Record<string, number | null> = {};
  savingBusinessNumber = signal<string | null>(null);
  /** מזהה איזה עסק כרגע בעדכון (למניעת כפתור loading תקוע בעסק חדש עם businessNumber null) */
  savingBusinessId = signal<number | null>(null);
  savingPersonal = signal<boolean>(false);
  savingSpouse = signal<boolean>(false);
  savingChildren = signal<boolean>(false);
  addingBusiness = signal<boolean>(false);
  addBusinessModalVisible = signal<boolean>(false);
  /** הודעות שגיאה לדיאלוג הוספת עסק */
  addBusinessErrors = signal<Record<string, string>>({});
  newBusinessForm = {
    businessName: '',
    businessNumber: '',
    businessAddress: '',
    businessPhone: '',
    businessEmail: '',
    businessType: '' as string,
    advanceTaxPercent: null as number | null
  };

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  tabs = [
    { label: 'פרטים אישיים', value: 'personal' },
    { label: 'העסקים שלי', value: 'businesses' },
    { label: 'ניהול הרשאות וחשבונות', value: 'permissions' },
  ];
  selectedTab: string = 'personal';

  familyStatusOptions = familyStatusOptionsList;
  employmentTypeOptions = employmentTypeOptionsList;
  businessTypeOptions = businessTypeOptionsList;
  nationalInsOptions = [
    { name: 'חייב',    value: true },
    { name: 'לא חייב', value: false },
  ];
  vatReportingOptions = [
    { name: 'לא רלוונטי', value: VATReportingType.NOT_REQUIRED },
    { name: 'חד חודשי',   value: VATReportingType.MONTHLY_REPORT },
    { name: 'דו חודשי',   value: VATReportingType.DUAL_MONTH_REPORT },
  ];
  taxReportingOptions = [
    { name: 'לא חייב',  value: TaxReportingType.NOT_REQUIRED },
    { name: 'חד חודשי', value: TaxReportingType.MONTHLY_REPORT },
    { name: 'דו חודשי', value: TaxReportingType.DUAL_MONTH_REPORT },
  ];

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

  spouseForm = {
    spouseFName: '',
    spouseLName: '',
    spouseId: '',
    spouseEmail: '',
    spousePhone: '',
    spouseDateOfBirth: '' as string,
    spouseEmploymentStatus: '' as string
  };

  /** ההרשאות שלי */
  myPermissions = signal<{ agentId: string; email: string; fullName: string; scopes: string[] }[]>([]);
  permissionsLoading = signal(false);

  /** Account sources (credit cards + bank accounts) from backend `transactions/source` table. */
  accountSourcesLoading = signal(false);
  accountSources = signal<
    { sourceName: string; sourceType: paymentIdentifierType; billName: string | null }[]
  >([]);
  addPermissionDialogVisible = false;
  addPermissionEmail = '';
  addingPermission = signal(false);
  addPermissionError = signal('');

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.initPersonalFormFromUserData();
    this.initSpouseFormFromUserData();
    this.loadBusinesses();
    this.loadChildren();
    this.fetchMyPermissions();
    // מקורות חשבון (get-sources-with-types) נטענים בלחיצה על טאב "ניהול הרשאות וחשבונות" — ראה onTabChange
    // רענון נתונים מהשרת כדי להציג תאריך בן/בת זוג ועוד שדות שעודכנו (למשל בדאטאבייס)
    this.authService.restoreUserData().subscribe({
      next: (data) => {
        if (data) {
          this.userData = data;
          this.initPersonalFormFromUserData();
          this.initSpouseFormFromUserData();
        }
      }
    });
  }

  onTabChange(newTabValue: string): void {
    this.selectedTab = newTabValue;
    if (newTabValue === 'permissions') {
      this.fetchAccountSources();
    }
  }

  private fetchAccountSources(): void {
    this.accountSourcesLoading.set(true);
    console.log('[Settings] ניהול הרשאות וחשבונות: שולחים GET get-sources-with-types');
    this.transactionsService.getSourcesWithTypes().subscribe({
      next: (sources) => {
        const rows = Array.isArray(sources) ? sources : [];
        console.log('[Settings] ניהול הרשאות וחשבונות: תגובה מהשרת (get-sources-with-types)', {
          count: rows.length,
          rows,
        });
        this.accountSources.set(rows);
        this.accountSourcesLoading.set(false);
      },
      error: (err) => {
        console.error('[Settings] ניהול הרשאות וחשבונות: שגיאה ב-get-sources-with-types', err);
        this.accountSources.set([]);
        this.accountSourcesLoading.set(false);
      },
    });
  }

  getSourceTypeLabel(sourceType: paymentIdentifierType): string {
    return sourceType === paymentIdentifierType.CREDIT_CARD ? 'כרטיס אשראי' : 'חשבון בנק';
  }

  private initPersonalFormFromUserData(): void {
    const u = this.userData;
    if (!u) return;
    this.personalForm.fName = u.fName ?? '';
    this.personalForm.lName = u.lName ?? '';
    this.personalForm.id = u.id ?? '';
    this.personalForm.email = u.email ?? '';
    this.personalForm.phone = u.phone ?? '';
    this.personalForm.dateOfBirth = this.toDisplayDate(u.dateOfBirth);
    this.personalForm.city = u.city ?? '';
    this.personalForm.familyStatus = u.familyStatus ?? '';
    this.personalForm.employmentStatus = u.employmentStatus ?? '';
  }

  private initSpouseFormFromUserData(): void {
    const u = this.userData;
    if (!u) return;
    this.spouseForm.spouseFName = u.spouseFName ?? '';
    this.spouseForm.spouseLName = u.spouseLName ?? '';
    this.spouseForm.spouseId = u.spouseId ?? '';
    this.spouseForm.spouseEmail = u.spouseEmail ?? '';
    this.spouseForm.spousePhone = u.spousePhone ?? '';
    const rawDate = u.spouseDateOfBirth ?? (u as any).spouse_date_of_birth;
    this.spouseForm.spouseDateOfBirth = this.toDisplayDate(rawDate);
    this.spouseForm.spouseEmploymentStatus = u.spouseEmploymentStatus ?? '';
  }

  /** Convert any date to dd-mm-yyyy for display in the form */
  toDisplayDate(val: string | Date | null | undefined): string {
    if (val == null || val === '') return '';
    if (typeof val === 'object' && 'getTime' in val) val = (val as Date).toISOString?.() ?? String(val);
    const s = String(val).trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-');
      return `${d}-${m}-${y}`;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  /** Convert dd-mm-yyyy or yyyy-mm-dd to yyyy-mm-dd for API */
  toApiDate(val: string | null | undefined): string | undefined {
    if (val == null || val === '') return undefined;
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split('-');
      return `${y}-${m}-${d}`;
    }
    const date = new Date(val);
    if (isNaN(date.getTime())) return undefined;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
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
      next: () => this.onUpdateSuccess(false),
      error: () => this.onUpdateError(false)
    });
  }

  updateSpouseDetails(): void {
    this.savingSpouse.set(true);
    const payload = {
      spouseFName: this.spouseForm.spouseFName?.trim() || undefined,
      spouseLName: this.spouseForm.spouseLName?.trim() || undefined,
      spouseId: this.spouseForm.spouseId?.trim() || undefined,
      spouseEmail: this.spouseForm.spouseEmail?.trim() || undefined,
      spousePhone: this.spouseForm.spousePhone?.trim() || undefined,
      spouseDateOfBirth: this.toApiDate(this.spouseForm.spouseDateOfBirth) || undefined,
      spouseEmploymentStatus: this.spouseForm.spouseEmploymentStatus || undefined
    };
    this.authService.updateUser(payload).subscribe({
      next: () => this.onUpdateSuccess(true),
      error: () => this.onUpdateError(true)
    });
  }

  private onUpdateSuccess(_isSpouse: boolean): void {
    const setDone = () => {
      this.savingPersonal.set(false);
      this.savingSpouse.set(false);
      this.userData = this.authService.getUserDataFromLocalStorage();
      this.initPersonalFormFromUserData();
      this.initSpouseFormFromUserData();
      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: 'הפרטים עודכנו בהצלחה',
        life: 3000,
        key: 'br'
      });
    };
    this.authService.restoreUserData().subscribe({
      next: setDone,
      error: () => {
        this.savingPersonal.set(false);
        this.savingSpouse.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן לרענן את הנתונים',
          life: 3000,
          key: 'br'
        });
      }
    });
  }

  private onUpdateError(isSpouse: boolean): void {
    this.savingPersonal.set(false);
    this.savingSpouse.set(false);
    this.messageService.add({
      severity: 'error',
      summary: 'שגיאה',
      detail: 'לא ניתן לעדכן את הפרטים. נסה שוב מאוחר יותר.',
      life: 3000,
      key: 'br'
    });
  }

  loadBusinesses(): void {
    this.genericService.loadBusinessesFromServer().then(() => {
      this.businesses.set(this.genericService.businesses());
    });
  }

  addChild(): void {
    this.children.set([...this.children(), { childFName: '', childLName: '', childDate: '' }]);
  }

  fetchMyPermissions(): void {
    this.permissionsLoading.set(true);
    this.myPermissionsService.getMyPermissions().subscribe({
      next: (list) => {
        this.myPermissions.set(list ?? []);
        this.permissionsLoading.set(false);
      },
      error: () => {
        this.permissionsLoading.set(false);
        this.myPermissions.set([]);
      }
    });
  }

  openAddPermissionDialog(): void {
    this.addPermissionError.set('');
    this.addPermissionEmail = '';
    this.addPermissionDialogVisible = true;
  }

  closeAddPermissionDialog(): void {
    this.addPermissionDialogVisible = false;
    this.addPermissionError.set('');
  }

  submitAddPermission(): void {
    const email = this.addPermissionEmail?.trim();
    if (!email) {
      this.addPermissionError.set('נא להזין כתובת אימייל');
      return;
    }
    this.addPermissionError.set('');
    this.addingPermission.set(true);
    this.myPermissionsService.grantViewPermission(email).subscribe({
      next: (res) => {
        this.addingPermission.set(false);
        this.closeAddPermissionDialog();
        this.fetchMyPermissions();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: res.message ?? 'ההרשאה ניתנה בהצלחה',
          life: 3000,
          key: 'br'
        });
      },
      error: (err) => {
        this.addingPermission.set(false);
        const msg = err?.error?.message ?? err?.message ?? '';
        if (err?.status === 404 || (msg && msg.includes('לא קיים'))) {
          this.addPermissionError.set('המשתמש לא קיים במערכת');
        } else {
          this.addPermissionError.set(msg || 'אירעה שגיאה. נסה שוב.');
        }
      }
    });
  }

  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /** טלפון ישראלי: 05X-XXXXXXX (10 ספרות) */
  private readonly phonePattern = /^05\d{8}$/;

  openAddBusinessModal(): void {
    this.newBusinessForm = {
      businessName: '',
      businessNumber: '',
      businessAddress: '',
      businessPhone: '',
      businessEmail: '',
      businessType: '',
      advanceTaxPercent: null
    };
    this.addBusinessErrors.set({});
    this.addBusinessModalVisible.set(true);
  }

  private validateAddBusinessForm(): boolean {
    const err: Record<string, string> = {};
    const name = this.newBusinessForm.businessName?.trim() ?? '';
    const number = this.newBusinessForm.businessNumber?.trim() ?? '';
    const type = this.newBusinessForm.businessType?.trim() ?? '';
    const email = this.newBusinessForm.businessEmail?.trim() ?? '';
    const phone = this.newBusinessForm.businessPhone?.trim() ?? '';

    if (!name) err['businessName'] = 'שם העסק חובה';
    if (!number) err['businessNumber'] = 'מספר עסק חובה';
    if (!type) err['businessType'] = 'סוג עסק חובה';
    if (!email) err['businessEmail'] = 'אימייל חובה';
    else if (!this.emailPattern.test(email)) err['businessEmail'] = 'כתובת אימייל לא חוקית';
    if (!phone) err['businessPhone'] = 'פלאפון חובה';
    else {
      const digits = phone.replace(/\D/g, '');
      const normalized = digits.startsWith('972') ? '0' + digits.slice(3) : digits.startsWith('0') ? digits : '0' + digits;
      if (normalized.length !== 10 || !this.phonePattern.test(normalized)) err['businessPhone'] = 'מספר פלאפון לא חוקי';
    }

    this.addBusinessErrors.set(err);
    return Object.keys(err).length === 0;
  }

  submitAddBusiness(): void {
    if (!this.validateAddBusinessForm()) return;
    this.addingBusiness.set(true);
    const payload = {
      businessName: this.newBusinessForm.businessName?.trim() || undefined,
      businessNumber: this.newBusinessForm.businessNumber?.trim() || undefined,
      businessAddress: this.newBusinessForm.businessAddress?.trim() || undefined,
      businessPhone: this.newBusinessForm.businessPhone?.trim() || undefined,
      businessEmail: this.newBusinessForm.businessEmail?.trim() || undefined,
      businessType: this.newBusinessForm.businessType || undefined,
      advanceTaxPercent: this.newBusinessForm.advanceTaxPercent ?? undefined
    };
    this.genericService.createBusiness(payload)
      .then(() => {
        this.addBusinessModalVisible.set(false);
        this.businesses.set(this.genericService.businesses());
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'העסק נוסף בהצלחה',
          life: 3000,
          key: 'br'
        });
      })
      .catch(() => {
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן להוסיף עסק. נסה שוב מאוחר יותר.',
          life: 3000,
          key: 'br'
        });
      })
      .finally(() => this.addingBusiness.set(false));
  }

  deleteBusiness(business: Business): void {
    if (business.id == null) return;
    this.confirmationService.confirm({
      message: 'האם אתה בטוח שברצונך למחוק את העסק?',
      header: 'אישור מחיקה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => {
        this.genericService.deleteBusiness(business.id!)
          .then(() => {
            this.businesses.set(this.genericService.businesses());
            this.messageService.add({
              severity: 'success',
              summary: 'הצלחה',
              detail: 'העסק נמחק',
              life: 3000,
              key: 'br'
            });
          })
          .catch(() => {
            this.messageService.add({
              severity: 'error',
              summary: 'שגיאה',
              detail: 'לא ניתן למחוק את העסק.',
              life: 3000,
              key: 'br'
            });
          });
      }
    });
  }

  confirmDeleteChild(child: IChild): void {
    const index = child.index;
    if (index == null) return;
    this.confirmationService.confirm({
      message: 'האם אתה בטוח שברצונך להסיר את הילד?',
      header: 'אישור הסרה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'הסר',
      rejectLabel: 'ביטול',
      accept: () => this.doDeleteChild(index)
    });
  }

  private doDeleteChild(index: number): void {
    this.authService.deleteChild(index).subscribe({
      next: () => {
        this.loadChildren();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הילד/ה נמחק/ה',
          life: 3000,
          key: 'br'
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן למחוק.',
          life: 3000,
          key: 'br'
        });
      }
    });
  }

  loadChildren(): void {
    this.authService.getChildren().subscribe({
      next: (list) => {
        const arr = Array.isArray(list) ? list : [];
        arr.forEach((c: IChild) => {
          if (c.childDate) c.childDate = this.toDisplayDate(c.childDate);
        });
        this.children.set(arr);
      },
      error: () => this.children.set([])
    });
  }

  updateChildrenDetails(): void {
    const list = this.children().map(c => ({
      childFName: c.childFName?.trim() ?? '',
      childLName: c.childLName?.trim() ?? '',
      childDate: this.toApiDate(c.childDate) ?? ''
    }));
    this.savingChildren.set(true);
    this.authService.updateChildren(list).subscribe({
      next: (saved) => {
        const arr = Array.isArray(saved) ? saved : [];
        arr.forEach((c: IChild) => {
          if (c.childDate) c.childDate = this.toDisplayDate(c.childDate);
        });
        this.children.set(arr);
        this.savingChildren.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'פרטי הילדים עודכנו בהצלחה',
          life: 3000,
          key: 'br'
        });
      },
      error: () => {
        this.savingChildren.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן לעדכן את פרטי הילדים. נסה שוב מאוחר יותר.',
          life: 3000,
          key: 'br'
        });
      }
    });
  }

  getBusinessKey(business: Business): string | number {
    if (business.id != null) return `id-${business.id}`;
    return business.businessNumber ?? '';
  }

  getAdvanceTaxDisplay(business: Business): string | number {
    const key = this.getBusinessKey(business);
    if (this.advanceTaxEdit[key as string] !== undefined && this.advanceTaxEdit[key as string] !== null) {
      const v = this.advanceTaxEdit[key as string] as number;
      return (v === 0 || v === null) ? 0 : v;
    }
    const p = business.advanceTaxPercent;
    return (p == null || p === 0) ? 0 : p;
  }

  setAdvanceTaxEdit(business: Business, event: Event): void {
    const key = this.getBusinessKey(business);
    const val = (event.target as HTMLInputElement).value;
    const num = val === '' ? null : Number(val);
    this.advanceTaxEdit[key as string] = num;
  }

  async saveBusiness(business: Business): Promise<void> {
    const key = this.getBusinessKey(business);
    const advanceValue = this.advanceTaxEdit[key as string] ?? business.advanceTaxPercent;
    const percent = advanceValue == null ? 0 : Number(advanceValue);
    if (isNaN(percent) || percent < 0 || percent > 100) return;
    const id = business.id ?? undefined;
    const businessNumber = business.businessNumber ?? undefined;
    if (id == null && (businessNumber == null || businessNumber === '')) return;
    this.savingBusinessId.set(business.id ?? null);
    this.savingBusinessNumber.set(business.businessNumber ?? null);
    try {
      await this.genericService.updateBusiness({
        id,
        businessNumber: businessNumber || undefined,
        advanceTaxPercent: percent,
        businessName: business.businessName ?? undefined,
        businessAddress: business.businessAddress ?? undefined,
        businessPhone: business.businessPhone ?? undefined,
        businessEmail: business.businessEmail ?? undefined,
        businessType: business.businessType ?? undefined,
        vatReportingType: business.vatReportingType ?? undefined,
        taxReportingType: business.taxReportingType ?? undefined,
        nationalInsRequired: business.nationalInsRequired ?? undefined,
      });
      delete this.advanceTaxEdit[key as string];
      this.businesses.set(this.genericService.businesses());
      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: 'פרטי העסק עודכנו בהצלחה',
        life: 3000,
        key: 'br'
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'לא ניתן לעדכן את העסק. נסה שוב.',
        life: 3000,
        key: 'br'
      });
    } finally {
      this.savingBusinessId.set(null);
      this.savingBusinessNumber.set(null);
    }
  }

  formatChildDate(childDate: string | null | undefined): string {
    if (!childDate) return '-';
    const s = String(childDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-');
      return `${d}-${m}-${y}`;
    }
    const date = new Date(childDate);
    if (isNaN(date.getTime())) return childDate;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
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

