import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { AccountImageComponent } from '../../components/account-image/account-image.component';
import { SettingsPage } from '../settings/settings.page';
import { SettingsField, SettingsNewFieldComponent } from './settings-new-field.component';
import { Validators } from '@angular/forms';
import { Business } from '../../shared/interface';

export type PersonalSection = 'account' | 'businesses';

/** Select the section entering the reading area, including a short final section. */
export function activePersonalSection(businessTop: number, viewportTop: number, atEnd: boolean): PersonalSection {
  return businessTop <= viewportTop + 240 || atEnd ? 'businesses' : 'account';
}

@Component({
  selector: 'app-settings-new', standalone: true,
  imports: [CommonModule, AccountImageComponent, SettingsNewFieldComponent],
  templateUrl: './settings-new.page.html', styleUrls: ['./settings-new.page.scss'],
})
export class SettingsNewPage extends SettingsPage implements AfterViewInit, OnDestroy {
  @ViewChild('scroller', { static: true }) scroller!: ElementRef<HTMLElement>;
  @ViewChild('businessSection', { static: true }) businessSection!: ElementRef<HTMLElement>;
  readonly activeSection = signal<PersonalSection>('account');
  readonly personalExpanded = signal(true);
  readonly familyMenuOpen = signal(false);
  readonly showSpouse = signal(false);
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

  onScroll(): void {
    const el = this.scroller.nativeElement;
    const atEnd = el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    this.activeSection.set(activePersonalSection(this.businessSection.nativeElement.getBoundingClientRect().top,
      el.getBoundingClientRect().top, atEnd));
  }
  goTo(section: PersonalSection): void {
    this.activeSection.set(section);
    const el = this.scroller.nativeElement;
    const top = section === 'account' ? 0 : this.businessSection.nativeElement.getBoundingClientRect().top
      - el.getBoundingClientRect().top + el.scrollTop - 32;
    el.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
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
    this.updatePersonalDetails();
  }
  saveSpouse(): void {
    if (this.authService.isViewingAsClient() || !this.valid(this.spouseFormGroup)) return;
    this.updateSpouseDetails();
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
    if (this.childrenFormArray.valid) this.updateChildrenDetails();
  }
}
