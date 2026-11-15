import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal, ChangeDetectorRef, inject } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { AccountImageComponent } from '../../components/account-image/account-image.component';
import { SettingsPage } from '../settings/settings.page';
import { SettingsField, SettingsNewFieldComponent } from './settings-new-field.component';
import { Validators } from '@angular/forms';
import { Business } from '../../shared/interface';
import { finalize, switchMap, take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SettingsNewSubscriptionComponent } from './settings-new-subscription.component';
import { PERSONAL_SETTINGS_LINKS, SUBSCRIPTION_SETTINGS_LINKS, SettingsSection, activeSettingsSection } from './settings-navigation';
import { GmailIntegrationComponent } from '../settings/gmail-integration/gmail-integration.component';
import { InboundEmailComponent } from '../settings/inbound-email/inbound-email.component';
import { OpenBankingManagementComponent } from '../../components/open-banking-management/open-banking-management.component';
import { OpenBankingErrorComponent } from '../../components/open-banking-management/open-banking-error.component';

export type PersonalSection = 'account' | 'businesses';

/** Select the section entering the reading area, including a short final section. */
export function activePersonalSection(businessTop: number, viewportTop: number, atEnd: boolean): PersonalSection {
  return businessTop <= viewportTop + 240 || atEnd ? 'businesses' : 'account';
}

@Component({
  selector: 'app-settings-new', standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ConfirmDialogModule, AccountImageComponent, SettingsNewFieldComponent, SettingsNewSubscriptionComponent, GmailIntegrationComponent, InboundEmailComponent, OpenBankingManagementComponent, OpenBankingErrorComponent],
  templateUrl: './settings-new.page.html', styleUrls: ['./settings-new.page.scss', './settings-new-connections.scss'],
})
export class SettingsNewPage extends SettingsPage implements AfterViewInit, OnDestroy {
  @ViewChild('scroller', { static: true }) scroller!: ElementRef<HTMLElement>;
  @ViewChild('businessSection', { static: true }) businessSection!: ElementRef<HTMLElement>;
  confirmLogout(): void {
    this.confirmationService.confirm({
      key: 'settings-new-logout',
      header: 'התנתקות',
      message: 'האם אתה בטוח שברצונך להתנתק?',
      icon: 'pi pi-sign-out',
      acceptLabel: 'התנתק',
      rejectLabel: 'ביטול',
      defaultFocus: 'reject',
      accept: () => this.authService.logout(),
    });
  }

  readonly activeSection = signal<SettingsSection>('account');
  private readonly navigationCdr = inject(ChangeDetectorRef);
  readonly personalLinks = PERSONAL_SETTINGS_LINKS;
  readonly subscriptionLinks = SUBSCRIPTION_SETTINGS_LINKS;
  readonly subscriptionExpanded = signal(true);
  readonly connectionsActivated = signal(false);
  readonly bankingActivated = signal(false);
  readonly personalExpanded = signal(true);
  readonly familyMenuOpen = signal(false);
  readonly showSpouse = signal(false);
  readonly personalEditing = signal(false);
  readonly spouseEditing = signal(false);
  readonly businessEditing = signal<number | null>(null);
  readonly childEditing = signal<number | null>(null);
  private resizeObserver?: ResizeObserver;
  private savedBusiness: Record<string, unknown> | null = null;

  readonly personalFields: SettingsField[] = [
    { key: 'fName', label: 'שם פרטי' }, { key: 'lName', label: 'שם משפחה' },
    { key: 'id', label: 'תעודת זהות' }, { key: 'email', label: 'כתובת אימייל', type: 'email' },
    { key: 'phone', label: 'מספר נייד', type: 'tel' }, { key: 'city', label: 'עיר מגורים' },
    { key: 'dateOfBirth', label: 'תאריך לידה', type: 'date' },
    { key: 'familyStatus', label: 'סטטוס', options: this.familyStatusOptions },
    { key: 'employmentStatus', label: 'תעסוקה', options: this.employmentTypeOptions },
  ];
  readonly spouseFields: SettingsField[] = [
    { key: 'spouseFName', label: 'שם פרטי' }, { key: 'spouseLName', label: 'שם משפחה' },
    { key: 'spouseId', label: 'תעודת זהות' }, { key: 'spouseEmail', label: 'כתובת אימייל', type: 'email' },
    { key: 'spousePhone', label: 'מספר נייד', type: 'tel' },
    { key: 'spouseEmploymentStatus', label: 'תעסוקה', options: this.employmentTypeOptions },
    { key: 'spouseDateOfBirth', label: 'תאריך לידה', type: 'date' },
  ];
  readonly childFields: SettingsField[] = [
    { key: 'childFName', label: 'שם פרטי' }, { key: 'childLName', label: 'שם משפחה' },
    { key: 'childDate', label: 'תאריך לידה', type: 'date' },
  ];
  readonly businessFields: SettingsField[] = [
    { key: 'businessName', label: 'שם העסק' }, { key: 'businessNumber', label: 'מספר עסק' },
    { key: 'proprietorRole', label: 'בעל/ת העסק', options: [] },
    { key: 'businessType', label: 'סוג עוסק', options: [] },
    { key: 'businessEmail', label: 'כתובת אימייל', type: 'email' },
    { key: 'nationalInsRequired', label: 'ביטוח לאומי', options: this.nationalInsOptions },
    { key: 'businessAddress', label: 'כתובת' },
    { key: 'vatReportingType', label: 'דיווח מע״מ', options: this.vatReportingOptions },
    { key: 'businessPhone', label: 'טלפון', type: 'tel' },
    { key: 'taxReportingType', label: 'מקדמות למס הכנסה', options: this.taxReportingOptions },
    { key: 'businessField', label: 'תחום עיסוק', options: this.businessFieldOptions },
    { key: 'advanceTaxPercent', label: 'אחוז מקדמות מס', type: 'number' },
  ];
  readonly newBusinessFields: SettingsField[] = this.businessFields.filter(field =>
    !['nationalInsRequired', 'taxReportingType', 'businessField'].includes(field.key));

  businessTypeLabel(value: string | null | undefined): string {
    return this.businessTypeOptions().find(option => option.value === value)?.name ?? '';
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.onScroll());
    this.resizeObserver.observe(this.scroller.nativeElement.firstElementChild!);
  }
  ngOnDestroy(): void { this.resizeObserver?.disconnect(); }

  private activateSection(section: SettingsSection): void {
    if ((section === 'permissions' || section === 'banking') && !this.connectionsActivated()) {
      this.connectionsActivated.set(true);
      this.onTabChange('permissions');
    }
    if (section === 'banking') this.bankingActivated.set(true);
  }
  onScroll(): void {
    const el = this.scroller.nativeElement;
    const sections = Array.from(el.querySelectorAll<HTMLElement>('[data-settings-section]')).map(node => ({
      key: node.dataset['settingsSection'] as SettingsSection, top: node.getBoundingClientRect().top,
    }));
    const atEnd = el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    const active = activeSettingsSection(sections, el.getBoundingClientRect().top, atEnd);
    this.activeSection.set(active);
    this.activateSection(active);
  }
  goTo(section: SettingsSection): void {
    this.activeSection.set(section);
    this.activateSection(section);
    this.navigationCdr?.detectChanges();
    const el = this.scroller.nativeElement;
    const target = section === 'account' ? null : section === 'businesses' ? this.businessSection.nativeElement
      : el.querySelector<HTMLElement>('[data-settings-section="' + section + '"]');
    const top = section === 'account' ? 0 : target ? target.getBoundingClientRect().top
      - el.getBoundingClientRect().top + el.scrollTop - 32 : el.scrollTop;
    el.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  submitNewPermission(): void {
    if (this.addingPermission() || !this.valid(this.addPermissionFormGroup)) return;
    this.addPermissionEmail = this.addPermissionFormGroup.get('email')?.value ?? '';
    this.submitAddPermission();
  }
  shaamStatusLabel(number: string | null | undefined): string {
    if (!number) return 'חסר מספר עסק';
    return ({ loading: 'בודק חיבור...', connected: 'מחובר', disconnected: 'לא מחובר',
      'reauth-required': 'נדרשת הרשאה חדשה', 'sandbox-blocked': 'החיבור מוגבל לעסק הדמו בסביבת הבדיקות',
      error: 'לא ניתן לבדוק את החיבור' })[this.shaamConnectionStatus(number)];
  }
  fieldsForBusiness(group: FormGroup, creating = false, editing = true): SettingsField[] {
    const readOrder = ['proprietorRole', 'nationalInsRequired', 'businessEmail', 'vatReportingType',
      'businessAddress', 'taxReportingType', 'businessPhone', 'advanceTaxPercent', 'businessField'];
    const fields = !creating && !editing
      ? readOrder.map(key => this.businessFields.find(f => f.key === key)!)
      : creating ? this.newBusinessFields : this.businessFields;
    return fields
      .filter(f => !(this.isCompany() && f.key === 'proprietorRole'))
      .filter(f => f.key !== 'vatReportingType' || !this.isExemptBusinessType(group.get('businessType')?.value))
      .map(f => f.key === 'proprietorRole' ? { ...f, options: this.proprietorOptions() }
        : f.key === 'businessType' ? { ...f, options: this.businessTypeOptions() } : f);
  }
  businessFieldChanged(group: FormGroup, field: SettingsField): void {
    if (field.key === 'proprietorRole') this.syncBusinessNumberToProprietor(group, group.get(field.key)?.value);
  }
  beginBusiness(index: number): void {
    if (this.businessEditing() !== null) this.cancelBusiness();
    this.businessEditing.set(index);
    this.savedBusiness = this.businessesFormArray.at(index).getRawValue();
  }
  cancelBusiness(): void {
    const index = this.businessEditing();
    if (index !== null && this.savedBusiness) this.businessesFormArray.at(index)?.reset(this.savedBusiness);
    this.businessEditing.set(null);
    this.savedBusiness = null;
  }
  requestDeleteBusiness(business: Business): void {
    this.cancelBusiness();
    this.deleteBusiness(business);
  }
  valid(group: FormGroup): boolean { group.markAllAsTouched(); return group.valid; }
  savePersonal(): void {
    if (this.authService.isViewingAsClient() || !this.valid(this.personalFormGroup)) return;
    this.persistAccountForm(false);
  }
  saveSpouse(): void {
    if (this.authService.isViewingAsClient() || !this.valid(this.spouseFormGroup)) return;
    this.persistAccountForm(true);
  }
  private apiFormDate(value: Date | null): string {
    if (!(value instanceof Date) || isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  private savedFormDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    const display = String(value).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    const result = iso ? new Date(+iso[1], +iso[2] - 1, +iso[3])
      : display ? new Date(+display[3], +display[2] - 1, +display[1]) : new Date(value);
    return isNaN(result.getTime()) ? null : result;
  }
  private persistAccountForm(isSpouse: boolean): void {
    const form = isSpouse ? this.spouseFormGroup : this.personalFormGroup;
    const saving = isSpouse ? this.savingSpouse : this.savingPersonal;
    const editing = isSpouse ? this.spouseEditing : this.personalEditing;
    if (saving()) return;
    const payload = Object.fromEntries(Object.entries(form.getRawValue()).map(([key, value]) => [
      key, value instanceof Date ? this.apiFormDate(value) || undefined : typeof value === 'string' ? value.trim() || undefined : value ?? undefined,
    ]));
    saving.set(true);
    this.authService.updateUser(payload).pipe(
      switchMap(() => this.authService.restoreUserData()),
      take(1),
      finalize(() => saving.set(false)),
    ).subscribe({
      next: user => {
        if (!user) {
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'הפרטים נשמרו אך לא ניתן לרענן את הנתונים. נסו שוב.', key: 'br' });
          return;
        }
        this.userData = user;
        const values = Object.fromEntries(Object.keys(form.controls).map(key => {
          const value = user[key] ?? (key === 'spouseDateOfBirth' ? user['spouse_date_of_birth'] : undefined);
          return [key, key === 'dateOfBirth' || key === 'spouseDateOfBirth' ? this.savedFormDate(value) : value ?? ''];
        }));
        form.patchValue(values);
        form.markAsPristine();
        editing.set(false);
        this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: 'הפרטים נשמרו בהצלחה', key: 'br' });
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא ניתן לשמור את הפרטים. נסו שוב.', key: 'br' }),
    });
  }
  async saveNewBusiness(index: number): Promise<void> {
    const group = this.businessesFormArray.at(index);
    if (!this.valid(group)) return;
    await this.saveBusiness(index);
    // A successful save replaces the form array; a rejected save keeps its old group.
    if (this.businessesFormArray.at(index) !== group) this.businessEditing.set(null);
  }
  addFamily(kind: 'spouse' | 'child'): void {
    this.familyMenuOpen.set(false);
    if (kind === 'spouse') { this.showSpouse.set(true); this.spouseEditing.set(true); }
    else {
      this.addChild();
      const group = this.childrenFormArray.at(this.childrenFormArray.length - 1);
      Object.values(group.controls).forEach(control => { control.addValidators(Validators.required); control.updateValueAndValidity(); });
      this.childEditing.set(this.childrenFormArray.length - 1);
    }
  }
  hasSpouse(): boolean {
    return !!(this.userData?.spouseFName || this.userData?.spouseId || this.showSpouse());
  }
  removeNewChild(index: number): void {
    if (this.children()[index]?.index != null) this.confirmDeleteChild(this.children()[index]);
    else {
      this.childrenFormArray.removeAt(index);
      this.children.update(list => list.filter((_, i) => i !== index));
      this.childEditing.set(null);
    }
  }
  saveFamilyChildren(): void {
    if (this.authService.isViewingAsClient()) return;
    this.childrenFormArray.markAllAsTouched();
    if (!this.childrenFormArray.valid || this.savingChildren()) return;
    const payload = this.childrenFormArray.controls.map(group => {
      const value = group.getRawValue();
      return {
        childFName: value.childFName?.trim() ?? '',
        childLName: value.childLName?.trim() ?? '',
        childDate: this.apiFormDate(value.childDate),
      };
    });
    this.savingChildren.set(true);
    this.authService.updateChildren(payload).pipe(take(1), finalize(() => this.savingChildren.set(false))).subscribe({
      next: saved => {
        const children = Array.isArray(saved) ? saved : [];
        this.children.set(children);
        this.childrenFormArray.clear();
        children.forEach(child => this.childrenFormArray.push(this.buildChildForm(child)));
        this.childEditing.set(null);
        this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: 'פרטי הילדים נשמרו בהצלחה', key: 'br' });
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא ניתן לשמור את פרטי הילדים. נסו שוב.', key: 'br' }),
    });
  }
}
