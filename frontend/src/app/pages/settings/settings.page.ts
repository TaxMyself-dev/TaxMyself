import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { AccessService } from 'src/app/services/access.service';
import { AppFeature } from 'src/app/shared/access-control';
import { MyPermissionsService } from 'src/app/services/my-permissions.service';
import { IUserData, Business, IChild, IColumnDataTable, IMobileCardConfig, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { AvatarModule } from 'primeng/avatar';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SelectModule } from 'primeng/select';
import { familyStatusOptionsList, employmentTypeOptionsList, businessTypeOptionsList, companyBusinessTypeOptionsList, isExemptBusinessType, paymentIdentifierType, VATReportingType, TaxReportingType, inputsSize } from 'src/app/shared/enums';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { SyncStatusService } from 'src/app/services/sync-status.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { SharedModule } from 'src/app/shared/shared.module';
import { MyCategoriesTabComponent } from './my-categories-tab/my-categories-tab.component';
import { GmailIntegrationComponent } from './gmail-integration/gmail-integration.component';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { DriveDocsService } from 'src/app/services/drive-docs.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss', '../../shared/shared-styling.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonComponent,
    AvatarModule,
    ToastModule,
    DialogModule,
    ConfirmDialogModule,
    SelectModule,
    SharedModule,
    MyCategoriesTabComponent,
    GmailIntegrationComponent,
    GenericTableComponent,
    InputTextComponent,
    InputDateComponent,
    InputSelectComponent,
  ],
  providers: []
})
export class SettingsPage implements OnInit {
  authService = inject(AuthService);
  genericService = inject(GenericService);
  messageService = inject(MessageService);
  confirmationService = inject(ConfirmationService);
  myPermissionsService = inject(MyPermissionsService);
  transactionsService = inject(TransactionsService);
  syncStatusService = inject(SyncStatusService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  driveDocsService = inject(DriveDocsService);
  private readonly fb = inject(FormBuilder);
  private readonly accessService = inject(AccessService);

  /** sourceName of the account whose single-account pull is in flight (disables that row's button). */
  retryingSourceId = signal<string | null>(null);

  userData: IUserData | null = null;
  businesses = signal<Business[]>([]);
  children = signal<IChild[]>([]);
  savingBusinessId = signal<number | null>(null);
  savingPersonal = signal<boolean>(false);
  savingSpouse = signal<boolean>(false);
  savingChildren = signal<boolean>(false);
  addingBusiness = signal<boolean>(false);
  addBusinessModalVisible = signal<boolean>(false);
  uploadingDocsBusinessId = signal<number | null>(null);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  readonly inputsSize = inputsSize;
  isMobile = computed(() => this.genericService.isMobile());

  readonly tabs = computed(() => [
    { label: 'פרטים אישיים', value: 'personal' },
    { label: 'העסקים שלי', value: 'businesses' },
    ...(this.accessService.getFeatureState(AppFeature.CATEGORY_LIST_TAB).visible
      ? [{ label: 'הקטגוריות שלי', value: 'categories' }]
      : []),
    ...(this.accessService.getFeatureState(AppFeature.OPEN_BANKING_PERMISSIONS_TAB).visible
      ? [{ label: 'ניהול הרשאות וחשבונות', value: 'permissions' }]
      : []),
  ]);
  selectedTab: string = 'personal';

  familyStatusOptions = familyStatusOptionsList;
  employmentTypeOptions = employmentTypeOptionsList;
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

  /** Exposed for the template (businessType !== EXEMPT check must also cover EXEMPT_PARTNERSHIP). */
  readonly isExemptBusinessType = isExemptBusinessType;

  /** Company users have no spouse/children/personal-family data — those sections are hidden. */
  isCompany(): boolean {
    return !!this.userData?.isCompany;
  }

  /** Business-type dropdown options differ for company vs. private users, same split as registration. */
  businessTypeOptions() {
    return this.isCompany() ? companyBusinessTypeOptionsList : businessTypeOptionsList;
  }

  // ─── Reactive Forms ───
  personalFormGroup  = this.buildPersonalForm();
  spouseFormGroup    = this.buildSpouseForm();
  addBusinessFormGroup  = this.buildAddBusinessForm();
  addPermissionFormGroup = this.buildAddPermissionForm();
  childrenFormArray  = this.fb.array<FormGroup>([]);
  businessesFormArray = this.fb.array<FormGroup>([]);

  /** ההרשאות שלי */
  myPermissions = signal<{ agentId: string; email: string; fullName: string; scopes: string[] }[]>([]);
  permissionsLoading = signal(false);

  /** Account sources (credit cards + bank accounts) from backend `transactions/source` table. */
  accountSourcesLoading = signal(false);
  accountSources = signal<
    { sourceName: string; sourceType: paymentIdentifierType; billName: string | null; hasConsent: boolean }[]
  >([]);

  /** Flat IRowDataTable rows derived from accountSources for GenericTable. */
  accountSourcesTableData = computed<IRowDataTable[]>(() =>
    this.accountSources().map(s => ({
      id: s.sourceName,
      sourceName: s.sourceName,
      sourceTypeLabel: this.getSourceTypeLabel(s.sourceType),
      billName: s.billName || 'לא משויך',
      consentStatus: s.hasConsent ? '✓ פעיל' : '✗ ללא הרשאה',
      
    }))
  );

  accountSourcesColumns: IColumnDataTable<string, string>[] = [
    { name: 'consentStatus',   value: 'סטטוס' },
    { name: 'sourceName',      value: 'מספר מזהה' },
    { name: 'sourceTypeLabel', value: 'סוג' },
    { name: 'billName',        value: 'משויך לחשבון' },
  ];

  readonly accountSourcesMobileCardConfig: IMobileCardConfig = {
    primaryFields: ['sourceName'],
    highlightedField: 'consentStatus',
    dateField: 'sourceTypeLabel',
    hiddenFields: [],
    highlightedValueFormat: 'plain',
  };

  accountSourcesRowActions: ITableRowAction[] = [
    {
      name: 'pullSource',
      icon: 'pi pi-refresh',
      title: 'משוך תנועות',
      showWhen: (row) => !this.retryingSourceId() || this.retryingSourceId() === row['sourceName'],
      isLoading: () => !!this.retryingSourceId(),
      action: (_, row) => {
        const source = this.accountSources().find(s => s.sourceName === row!['sourceName']);
        if (source) this.onPullSource(source);
      },
    },
  ];

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
    // חזרה מ-OAuth של Google נוחתת כאן עם ?tab=permissions&googleIntegration=...
    this.handleReturnFromGoogleOauth();
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

  /**
   * Handles the Google OAuth return redirect (integrations.controller sends the
   * browser to /settings?tab=permissions&googleIntegration=success|error&reason=...).
   * Opens the requested tab, shows a global toast, then strips the params so a
   * refresh or back-navigation doesn't re-toast. Snapshot read is enough — the
   * redirect is always a fresh full-page load.
   */
  private handleReturnFromGoogleOauth(): void {
    const params = this.route.snapshot.queryParams;
    const tab = params['tab'];
    const googleIntegration = params['googleIntegration'];
    const reason = params['reason'];
    if (!tab && !googleIntegration) return;

    if (tab && this.tabs.some((t) => t.value === tab)) {
      this.onTabChange(tab);
    }

    if (googleIntegration === 'success') {
      this.messageService.add({
        severity: 'success',
        summary: 'חשבון Google חובר',
        detail: 'חשבון ה-Gmail חובר בהצלחה.',
        life: 4000,
        key: 'br',
      });
    } else if (googleIntegration === 'error') {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: this.googleOauthErrorDetail(reason),
        life: 6000,
        key: 'br',
      });
    }

    // Remove only the OAuth-return params, keeping the rest of the URL intact.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: null, googleIntegration: null, reason: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Maps the backend/Google `reason` code to a user-facing Hebrew message. */
  private googleOauthErrorDetail(reason: string | undefined): string {
    switch (reason) {
      case 'access_denied':
        return 'החיבור בוטל. לא ניתנה הרשאה לחשבון Google.';
      case 'no_refresh_token':
        return 'החיבור נכשל: לא התקבלה הרשאה מתמשכת מ-Google. נסה שוב.';
      case 'missing_code':
      case 'callback_failed':
        return 'חיבור חשבון Google נכשל. נסה שוב.';
      default:
        return 'חיבור חשבון Google נכשל. נסה שוב.';
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

  /**
   * Pull transactions for ONE account/card (single attempt). The source's
   * `sourceName` is exactly the `sourceId` the backend expects, and
   * `sourceType` maps to bank/card. Routes to POST /transactions/retry-source
   * → feezbackService.retrySource → pullOneSource (no getUserAccounts re-pull).
   */
  onPullSource(s: { sourceName: string; sourceType: paymentIdentifierType }): void {
    if (this.retryingSourceId()) return; // one at a time
    const type: 'bank' | 'card' =
      s.sourceType === paymentIdentifierType.CREDIT_CARD ? 'card' : 'bank';
    this.retryingSourceId.set(s.sourceName);
    this.syncStatusService
      .retrySource(type, s.sourceName)
      .pipe(
        catchError((err) => {
          const detail =
            err?.status === 409
              ? 'סנכרון כבר רץ — נסה שוב בעוד מספר רגעים'
              : 'משיכת התנועות נכשלה, אנא נסה שוב';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.retryingSourceId.set(null)),
      )
      .subscribe((result) => {
        const ok = result?.status === 'success';
        this.messageService.add({
          severity: ok ? 'success' : 'warn',
          summary: ok ? 'הסתיים' : 'לא הושלם',
          detail: ok
            ? `נמשכו ${result.transactionCount} תנועות עבור ${s.sourceName}`
            : `לא ניתן היה למשוך את ${s.sourceName}${result?.error ? ` (${result.error})` : ''}`,
          life: 6000,
          key: 'br',
        });
        this.fetchAccountSources();
      });
  }

  getSourceTypeLabel(sourceType: paymentIdentifierType): string {
    return sourceType === paymentIdentifierType.CREDIT_CARD ? 'כרטיס אשראי' : 'חשבון בנק';
  }

  private initPersonalFormFromUserData(): void {
    if (this.userData) this.patchPersonalForm(this.userData);
  }

  private initSpouseFormFromUserData(): void {
    if (this.userData) this.patchSpouseForm(this.userData);
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

  /** Convert a Date object to yyyy-mm-dd string for API. Avoids UTC-shift by using local parts. */
  private dateToApiString(date: Date | null | undefined): string | undefined {
    if (!date) return undefined;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
    const v = this.personalFormGroup.getRawValue();
    const payload = {
      fName:            v.fName?.trim() || undefined,
      lName:            v.lName?.trim() || undefined,
      id:               v.id?.trim() || undefined,
      email:            v.email?.trim() || undefined,
      phone:            v.phone?.trim() || undefined,
      dateOfBirth:      this.dateToApiString(v.dateOfBirth) || undefined,
      city:             v.city?.trim() || undefined,
      familyStatus:     v.familyStatus || undefined,
      employmentStatus: v.employmentStatus || undefined,
    };
    this.authService.updateUser(payload).subscribe({
      next: () => this.onUpdateSuccess(false),
      error: (err) => this.onUpdateError(false, err)
    });
  }

  updateSpouseDetails(): void {
    this.savingSpouse.set(true);
    const v = this.spouseFormGroup.getRawValue();
    const payload = {
      spouseFName:            v.spouseFName?.trim() || undefined,
      spouseLName:            v.spouseLName?.trim() || undefined,
      spouseId:               v.spouseId?.trim() || undefined,
      spouseEmail:            v.spouseEmail?.trim() || undefined,
      spousePhone:            v.spousePhone?.trim() || undefined,
      spouseDateOfBirth:      this.dateToApiString(v.spouseDateOfBirth) || undefined,
      spouseEmploymentStatus: v.spouseEmploymentStatus || undefined,
    };
    this.authService.updateUser(payload).subscribe({
      next: () => this.onUpdateSuccess(true),
      error: (err) => this.onUpdateError(true, err)
    });
  }

  private onUpdateSuccess(isSpouse: boolean): void {
    const successDetail = isSpouse
      ? 'פרטי בן/בת זוג עודכנו בהצלחה'
      : 'הפרטים האישיים עודכנו בהצלחה';

    const setDone = () => {
      this.savingPersonal.set(false);
      this.savingSpouse.set(false);
      this.userData = this.authService.getUserDataFromLocalStorage();
      this.initPersonalFormFromUserData();
      this.initSpouseFormFromUserData();
      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: successDetail,
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

  private onUpdateError(isSpouse: boolean, err?: any): void {
    this.savingPersonal.set(false);
    this.savingSpouse.set(false);
    const apiMessage: string | undefined = err?.error?.message ?? err?.message;
    const fallback = isSpouse
      ? 'לא ניתן לעדכן את פרטי בן/בת זוג. נסה שוב מאוחר יותר.'
      : 'לא ניתן לעדכן את הפרטים האישיים. נסה שוב מאוחר יותר.';
    this.messageService.add({
      severity: 'error',
      summary: 'שגיאה',
      detail: apiMessage || fallback,
      life: 3000,
      key: 'br'
    });
  }

  loadBusinesses(): void {
    this.genericService.loadBusinessesFromServer().then(() => {
      const list = this.genericService.businesses();
      this.businesses.set(list);
      this.patchBusinessesFormArray(list);
    });
  }

  addChild(): void {
    this.children.set([...this.children(), { childFName: '', childLName: '', childDate: '' }]);
    this.childrenFormArray.push(this.buildChildForm(), { emitEvent: false });
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
    this.addPermissionFormGroup.reset({ email: '' });
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

  openAddBusinessModal(): void {
    this.patchAddBusinessForm();
    this.addBusinessModalVisible.set(true);
  }

  submitAddBusiness(): void {
    this.addBusinessFormGroup.markAllAsTouched();
    if (this.addBusinessFormGroup.invalid) return;
    this.addingBusiness.set(true);
    const v = this.addBusinessFormGroup.getRawValue();
    const payload = {
      businessName:      v.businessName?.trim() || undefined,
      businessNumber:    v.businessNumber?.trim() || undefined,
      businessAddress:   v.businessAddress?.trim() || undefined,
      businessPhone:     v.businessPhone?.trim() || undefined,
      businessEmail:     v.businessEmail?.trim() || undefined,
      businessType:      v.businessType || undefined,
      advanceTaxPercent: v.advanceTaxPercent ?? undefined,
    };
    this.genericService.createBusiness(payload)
      .then(() => {
        const updated = this.genericService.businesses();
        this.businesses.set(updated);
        this.patchBusinessesFormArray(updated);
        this.addBusinessModalVisible.set(false);
        this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: 'העסק נוסף בהצלחה', life: 3000, key: 'br' });
      })
      .catch(() => {
        this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא ניתן להוסיף עסק. נסה שוב מאוחר יותר.', life: 3000, key: 'br' });
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
            const updated = this.genericService.businesses();
            this.businesses.set(updated);
            this.patchBusinessesFormArray(updated);
            this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: 'העסק נמחק', life: 3000, key: 'br' });
          })
          .catch(() => {
            this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא ניתן למחוק את העסק.', life: 3000, key: 'br' });
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
        this.patchChildrenFormArray(arr);
      },
      error: () => this.children.set([])
    });
  }

  updateChildrenDetails(): void {
    const list = (this.childrenFormArray.controls as FormGroup[]).map(ctrl => {
      const v = ctrl.getRawValue();
      return {
        childFName: (v.childFName as string)?.trim() ?? '',
        childLName: (v.childLName as string)?.trim() ?? '',
        childDate:  this.dateToApiString(v.childDate as Date | null) ?? '',
      };
    });
    this.savingChildren.set(true);
    this.authService.updateChildren(list).subscribe({
      next: (saved) => {
        const arr = Array.isArray(saved) ? saved : [];
        arr.forEach((c: IChild) => {
          if (c.childDate) c.childDate = this.toDisplayDate(c.childDate);
        });
        this.children.set(arr);
        this.patchChildrenFormArray(arr);
        this.savingChildren.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'פרטי הילדים עודכנו בהצלחה',
          life: 3000,
          key: 'br'
        });
      },
      error: (err) => {
        this.savingChildren.set(false);
        const apiMessage: string | undefined = err?.error?.message ?? err?.message;
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: apiMessage || 'לא ניתן לעדכן את פרטי הילדים. נסה שוב מאוחר יותר.',
          life: 3000,
          key: 'br'
        });
      }
    });
  }

  async saveBusiness(index: number): Promise<void> {
    const ctrl = this.businessesFormArray.at(index) as FormGroup;
    const v = ctrl.getRawValue();
    const biz = this.businesses()[index];

    const advanceTaxPercent = v.advanceTaxPercent == null ? 0 : Number(v.advanceTaxPercent);
    if (isNaN(advanceTaxPercent) || advanceTaxPercent < 0 || advanceTaxPercent > 100) return;

    const id = biz?.id ?? undefined;
    const businessNumber = (v.businessNumber as string)?.trim() || biz?.businessNumber || undefined;
    if (id == null && !businessNumber) return;

    this.savingBusinessId.set(id ?? null);
    try {
      await this.genericService.updateBusiness({
        id,
        businessNumber:      businessNumber || undefined,
        advanceTaxPercent,
        businessName:        (v.businessName as string)?.trim()    || biz?.businessName    || undefined,
        businessAddress:     (v.businessAddress as string)?.trim() || undefined,
        businessPhone:       (v.businessPhone as string)?.trim()   || undefined,
        businessEmail:       (v.businessEmail as string)?.trim()   || undefined,
        businessType:        (v.businessType as string)            || undefined,
        vatReportingType:    (v.vatReportingType as string)        || undefined,
        taxReportingType:    (v.taxReportingType as string)        || undefined,
        nationalInsRequired: (v.nationalInsRequired as boolean | null) ?? undefined,
      });
      const updated = this.genericService.businesses();
      this.businesses.set(updated);
      this.patchBusinessesFormArray(updated);
      this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: 'פרטי העסק עודכנו בהצלחה', life: 3000, key: 'br' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא ניתן לעדכן את העסק. נסה שוב.', life: 3000, key: 'br' });
    } finally {
      this.savingBusinessId.set(null);
    }
  }

  /** בונה קישור לתיקיית ה-Inbox של העסק ב-Google Drive (null אם עדיין לא הוקצתה) */
  getInboxFolderUrl(biz: Business | undefined): string | null {
    return biz?.driveInboxFolderId
      ? `https://drive.google.com/drive/folders/${biz.driveInboxFolderId}`
      : null;
  }

  /**
   * "העלאת מסמכים ל-Drive" — user picked one or more files off their
   * machine; drop them straight into the business's Drive inbox/ folder
   * (no OCR, just storage). Resets the input afterward so re-picking the
   * same filename still fires `change`.
   */
  onUploadDocsToDrive(biz: Business | undefined, input: HTMLInputElement): void {
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (!files.length || biz?.id == null || !biz.businessNumber) return;

    this.uploadingDocsBusinessId.set(biz.id);
    this.driveDocsService.uploadFilesToInbox(files, biz.businessNumber).subscribe({
      next: (uploaded) => {
        this.uploadingDocsBusinessId.set(null);
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: `${uploaded.length} קבצים הועלו ל-Drive בהצלחה`,
          life: 3000,
          key: 'br'
        });
      },
      error: () => {
        this.uploadingDocsBusinessId.set(null);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן היה להעלות את הקבצים ל-Drive. נסה שוב מאוחר יותר.',
          life: 3000,
          key: 'br'
        });
      }
    });
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Reactive Forms — builder methods
  // ─────────────────────────────────────────────────────────────────────────────

  buildPersonalForm() {
    return this.fb.group({
      fName:            this.fb.nonNullable.control(''),
      lName:            this.fb.nonNullable.control(''),
      id:               this.fb.nonNullable.control(''),
      email:            this.fb.nonNullable.control('', Validators.email),
      phone:            this.fb.nonNullable.control(''),
      // Stored as Date for future app-input-date migration.
      // TODO(migration): when template switches to app-input-date,
      //   remove toDisplayDate() and read Date directly from this control.
      dateOfBirth:      this.fb.control<Date | null>(null),
      city:             this.fb.nonNullable.control(''),
      familyStatus:     this.fb.nonNullable.control(''),
      employmentStatus: this.fb.nonNullable.control(''),
    });
  }

  buildSpouseForm() {
    return this.fb.group({
      spouseFName:            this.fb.nonNullable.control(''),
      spouseLName:            this.fb.nonNullable.control(''),
      spouseId:               this.fb.nonNullable.control(''),
      spouseEmail:            this.fb.nonNullable.control('', Validators.email),
      spousePhone:            this.fb.nonNullable.control(''),
      // Stored as Date for future app-input-date migration.
      // TODO(migration): spouse date is currently stored as a freeform text string
      //   (dd-mm-yyyy typed by the user). When the template switches to
      //   app-input-date, remove toDisplayDate() and read Date directly from here.
      spouseDateOfBirth:      this.fb.control<Date | null>(null),
      spouseEmploymentStatus: this.fb.nonNullable.control(''),
    });
  }

  buildAddBusinessForm() {
    return this.fb.group({
      businessName:      this.fb.nonNullable.control('', Validators.required),
      businessNumber:    this.fb.nonNullable.control('', Validators.required),
      businessAddress:   this.fb.nonNullable.control(''),
      businessPhone:     this.fb.nonNullable.control('', [
        Validators.required,
        (c: AbstractControl) => this.israeliPhoneValidatorFn(c),
      ]),
      businessEmail:     this.fb.nonNullable.control('', [Validators.required, Validators.email]),
      businessType:      this.fb.nonNullable.control('', Validators.required),
      advanceTaxPercent: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    });
  }

  /** Israeli mobile phone: 05X-XXXXXXX (10 digits after normalising +972 prefix). */
  private israeliPhoneValidatorFn(control: AbstractControl): ValidationErrors | null {
    const phone = (control.value as string) ?? '';
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    const normalized = digits.startsWith('972') ? '0' + digits.slice(3)
      : digits.startsWith('0') ? digits : '0' + digits;
    return normalized.length === 10 && /^05\d{8}$/.test(normalized)
      ? null : { israeliPhone: true };
  }

  buildAddPermissionForm() {
    return this.fb.group({
      email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    });
  }

  /** Builds a single-child FormGroup. Pass no argument for an empty (new) child row. */
  buildChildForm(child?: Partial<IChild>) {
    return this.fb.group({
      childFName: this.fb.nonNullable.control(child?.childFName ?? ''),
      childLName: this.fb.nonNullable.control(child?.childLName ?? ''),
      // Stored as Date for future app-input-date migration.
      // TODO(migration): child.childDate arrives as a dd-mm-yyyy string from
      //   the API (after toDisplayDate). When the template switches to
      //   app-input-date, read Date directly and remove the toApiDate() call
      //   in updateChildrenDetails().
      childDate:  this.fb.control<Date | null>(
        child?.childDate ? this.stringToDate(child.childDate) : null
      ),
    });
  }

  /** Builds a single-business FormGroup. Pass no argument for an empty (new) business row. */
  buildBusinessForm(business?: Partial<Business>) {
    return this.fb.group({
      businessNumber:      this.fb.nonNullable.control(business?.businessNumber ?? ''),
      businessName:        this.fb.nonNullable.control(business?.businessName ?? ''),
      businessEmail:       this.fb.nonNullable.control(business?.businessEmail ?? '', Validators.email),
      businessAddress:     this.fb.nonNullable.control(business?.businessAddress ?? ''),
      businessPhone:       this.fb.nonNullable.control(business?.businessPhone ?? ''),
      businessType:        this.fb.nonNullable.control<string>(business?.businessType ?? ''),
      nationalInsRequired: this.fb.control<boolean | null>(business?.nationalInsRequired ?? null),
      vatReportingType:    this.fb.nonNullable.control<string>(business?.vatReportingType ?? ''),
      taxReportingType:    this.fb.nonNullable.control<string>(business?.taxReportingType ?? ''),
      advanceTaxPercent:   this.fb.control<number | null>(
        business?.advanceTaxPercent ?? null,
        [Validators.min(0), Validators.max(100)]
      ),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reactive Forms — patch methods (sync FormGroup/FormArray from data model)
  // ─────────────────────────────────────────────────────────────────────────────

  private patchPersonalForm(u: IUserData): void {
    this.personalFormGroup.patchValue({
      fName:            u.fName ?? '',
      lName:            u.lName ?? '',
      id:               u.id ?? '',
      email:            u.email ?? '',
      phone:            u.phone ?? '',
      dateOfBirth:      this.stringToDate(u.dateOfBirth),
      city:             u.city ?? '',
      familyStatus:     u.familyStatus ?? '',
      employmentStatus: u.employmentStatus ?? '',
    }, { emitEvent: false });
  }

  private patchSpouseForm(u: IUserData): void {
    const rawDate = u.spouseDateOfBirth ?? (u as any).spouse_date_of_birth;
    this.spouseFormGroup.patchValue({
      spouseFName:            u.spouseFName ?? '',
      spouseLName:            u.spouseLName ?? '',
      spouseId:               u.spouseId ?? '',
      spouseEmail:            u.spouseEmail ?? '',
      spousePhone:            u.spousePhone ?? '',
      spouseDateOfBirth:      this.stringToDate(rawDate),
      spouseEmploymentStatus: u.spouseEmploymentStatus ?? '',
    }, { emitEvent: false });
  }

  /** Resets the add-business form to empty state (called on modal open). */
  private patchAddBusinessForm(): void {
    this.addBusinessFormGroup.reset({
      businessName:      '',
      businessNumber:    '',
      businessAddress:   '',
      businessPhone:     '',
      businessEmail:     '',
      businessType:      '',
      advanceTaxPercent: null,
    });
  }

  /** Resets the permission form to empty state (called on dialog open). */
  private patchAddPermissionForm(): void {
    this.addPermissionFormGroup.reset({ email: '' });
  }

  /** Rebuilds childrenFormArray to match the current children signal. */
  private patchChildrenFormArray(children: IChild[]): void {
    this.childrenFormArray.clear({ emitEvent: false });
    for (const child of children) {
      this.childrenFormArray.push(this.buildChildForm(child), { emitEvent: false });
    }
  }

  /** Rebuilds businessesFormArray to match the current businesses signal. */
  private patchBusinessesFormArray(businesses: Business[]): void {
    this.businessesFormArray.clear({ emitEvent: false });
    for (const biz of businesses) {
      this.businessesFormArray.push(this.buildBusinessForm(biz), { emitEvent: false });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reactive Forms — shared helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Converts a date string in dd-mm-yyyy, yyyy-mm-dd, or ISO format to a
   * local-midnight Date object. Returns null for empty / unparseable input.
   *
   * Uses explicit year/month/day construction to avoid UTC-midnight timezone
   * shifts that `new Date('yyyy-mm-dd')` would produce.
   */
  private stringToDate(val: string | Date | null | undefined): Date | null {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split('-');
      const date = new Date(+y, +m - 1, +d);
      return isNaN(date.getTime()) ? null : date;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-');
      const date = new Date(+y, +m - 1, +d);
      return isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(s);
    return isNaN(date.getTime()) ? null : date;
  }
}

