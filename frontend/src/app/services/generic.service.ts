import { computed, Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { LoadingController, PopoverController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, Subject, catchError, firstValueFrom, from, fromEvent, map, startWith, switchMap, tap } from 'rxjs';
import { Business, BusinessInfo, ISelectItem, IToastData, IUserData, User } from '../shared/interface';
import { PopupMessageComponent } from '../shared/popup-message/popup-message.component';
import { PopupConfirmComponent } from '../shared/popup-confirm/popup-confirm.component';
import { environment } from 'src/environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BusinessStatus, doubleMonthsList, ReportingPeriodType, singleMonthsList } from '../shared/enums';
import { toSignal } from '@angular/core/rxjs-interop';
import { DateService } from './date.service';
import { PeriodDefaults } from '../components/filter-tab/filter-fields-model.component';


@Injectable({ providedIn: 'root' })
export class GenericService {

  private loaderMessage$ = new BehaviorSubject<string>("Please wait...");
  private loaderInstance: HTMLIonLoadingElement | null = null; // Keep a reference to the loader instance
  private toastSubject = new Subject<IToastData>();

  toast$ = this.toastSubject.asObservable();

  constructor(
    private loader: LoadingController,
    private popoverController: PopoverController,
    private http: HttpClient,
    private dateService: DateService,
  ) {
    // Load from localStorage on app refresh
    const saved = localStorage.getItem('businesses');
    if (saved) {
      this._businesses.set(JSON.parse(saved));
    }
  }

  // --- signals (state) ---
  private _businesses = signal<Business[] | null>(null);
  readonly businesses = computed(() => this._businesses() ?? []);

  readonly businessSelectItems = computed<ISelectItem[]>(() =>
    (this._businesses() ?? []).map(b => ({
      name: b.businessName,
      value: b.businessNumber,
    }))
  );

  private _bills = signal<[] | null>(null);
  readonly bills = computed(() => this._bills() ?? []);
  readonly isLoadingBills = signal(false);

  private readonly viewportWidthSignal = typeof window !== 'undefined'
    ? toSignal(
      fromEvent(window, 'resize').pipe(
        startWith(null),
        map(() => window.innerWidth)
      ),
      { initialValue: window.innerWidth }
    )
    : signal(1024);

  private readonly isMobileSignal = computed(() => this.viewportWidthSignal() <= 768);

  isMobile(): boolean {
    return this.isMobileSignal();
  }

  mapLabelToName(
    options: ISelectItem[]
  ): Array<{ value: string | number | boolean | Date; label: string | number }> {
    return options.map(o => ({
      value: o.value,
      label: o.name
    }));
  }


  async loadBusinessesFromServer(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<Business[]>(`${environment.apiUrl}business/get-businesses`)
      );

      this.saveBusinesses(res ?? []);

    } catch (err) {
      console.error("❌ loadBusinesses failed", err);
    }
  }


  /** Save to both signal + localStorage */
  private saveBusinesses(data: Business[]) {
    this._businesses.set(data);
    localStorage.setItem('businesses', JSON.stringify(data));
  }

  /** עדכון אחוז מקדמות מס לעסק */
  async updateBusinessAdvanceTaxPercent(businessNumber: string, advanceTaxPercent: number): Promise<void> {
    await this.updateBusiness({ businessNumber, advanceTaxPercent });
  }

  /** עדכון פרטי עסק (תמיכה בעדכון לפי id לעסק חדש או לפי businessNumber) */
  async updateBusiness(payload: {
    id?: number;
    businessNumber?: string;
    advanceTaxPercent?: number;
    businessName?: string;
    businessAddress?: string;
    businessPhone?: string;
    businessEmail?: string;
    businessType?: string;
  }): Promise<Business> {
    const business = await firstValueFrom(
      this.http.patch<Business>(`${environment.apiUrl}business/update`, payload)
    );
    await this.loadBusinessesFromServer();
    return business;
  }

  /** יצירת עסק חדש למשתמש המחובר (עם פרטים אופציונליים מהמודל) */
  async createBusiness(payload?: {
    businessName?: string;
    businessNumber?: string;
    businessAddress?: string;
    businessPhone?: string;
    businessEmail?: string;
    businessType?: string;
    advanceTaxPercent?: number;
  }): Promise<Business> {
    const business = await firstValueFrom(
      this.http.post<Business>(`${environment.apiUrl}business/create`, payload ?? {})
    );
    await this.loadBusinessesFromServer();
    return business;
  }

  /** מחיקת עסק לפי id */
  async deleteBusiness(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${environment.apiUrl}business/${id}`)
    );
    await this.loadBusinessesFromServer();
  }

  getBusinessData(user: IUserData): {
    mode: BusinessStatus; uiList: { name: string; value: string }[]; fullList: BusinessInfo[]; showSelector: boolean;
  } {

    const fullList: BusinessInfo[] = [];

    if (user.businessStatus === 'MULTI_BUSINESS') {
      fullList.push({
        name: user.businessName,
        value: user.businessNumber,
        address: user.businessAddress,
        type: user.businessType,
        phone: user.phone,
        email: user.email
      });

      fullList.push({
        name: user.spouseBusinessName,
        value: user.spouseBusinessNumber,
        address: user.spouseBusinessAddress,
        type: user.spouseBusinessType,
        phone: user.spousePhone,
        email: user.spouseEmail
      });

      return {
        mode: BusinessStatus.MULTI_BUSINESS,
        uiList: fullList.map(b => ({ name: b.name, value: b.value })),
        fullList,
        showSelector: true
      };
    }

    fullList.push({
      name: user.businessName,
      value: user.businessNumber,
      address: user.businessAddress,
      type: user.businessType,
      phone: user.phone,
      email: user.email
    });

    return {
      mode: BusinessStatus.SINGLE_BUSINESS,
      uiList: fullList.map(b => ({ name: b.name, value: b.value })),
      fullList,
      showSelector: false
    };
  }


  showToast(message: string, type: 'success' | 'error', duration: number = 3000, color: string = 'primary', position: 'top' | 'middle' | 'bottom' = 'bottom') {
    const toastData: IToastData = {
      message,
      duration: type === 'error' ? -1 : duration,
      color,
      position,
      type
    }
    this.toastSubject.next(toastData);
  }

  getLoader(): Observable<any> {
    return from(this.loader.create({
      message: this.loaderMessage$.getValue(),
      spinner: 'crescent'
    }))
      .pipe(
        catchError((err) => {
          console.log("Error in creating loader", err);
          return EMPTY;
        }),
        switchMap((loader) => {
          if (loader) {
            this.loaderInstance = loader;  // Store the loader instance
            return from(loader.present())
              .pipe(
                // Listen to changes in the message and update the loader's message in real time
                switchMap(() => this.loaderMessage$.asObservable()
                  .pipe(
                    tap((message) => {
                      if (this.loaderInstance) {
                        this.loaderInstance.message = message;  // Update loader message dynamically
                      }
                    })
                  )
                )
              );
          }
          return EMPTY;
        }),
        catchError((err) => {
          console.log("Error in presenting loader", err);
          return EMPTY;
        })
      );
  }

  // Method to update the loader's message dynamically
  updateLoaderMessage(message: string): void {
    this.loaderMessage$.next(message);  // Trigger message update
  }

  dismissLoader(): void {
    if (this.loaderInstance) {
      this.loaderInstance.dismiss();
      this.loaderInstance = null; // Reset the reference after dismissing
    }
    else {
      console.log("in else dissmis");
    }
  }

  addComma(number: number | string): string {
    if (typeof number !== 'number') {
      const tempNum = Number(number);
      return tempNum.toLocaleString();
      //throw new Error('Input must be a number');
    }
    return number.toLocaleString();
  }


  convertStringToNumber(value: string): number {
    if (!value) return NaN; // Handle empty or invalid input
    // Remove commas and convert to number
    return Number(value.replace(/,/g, ''));
  }


  columnsOrderByFunc(a, b, columns: string[]): number {

    const indexA = columns.indexOf(a.key);
    const indexB = columns.indexOf(b.key);

    if (indexA === -1 && indexB !== -1) {
      return 1; // objA is not in the order list, move it to the end
    } else if (indexA !== -1 && indexB === -1) {
      return -1; // objB is not in the order list, move it to the end
    } else if (indexA === -1 && indexB === -1) {
      return 0; // both keys are not in the order list, leave them as is
    }

    if (indexA < indexB) {
      return -1;
    } else if (indexA > indexB) {
      return 1;
    } else {
      return 0;
    }
  }

  openPopupMessage(message: string): void {
    from(this.popoverController.create({
      component: PopupMessageComponent,
      componentProps: {
        message,
      },
      // cssClass: 
    }))
      .pipe(
        catchError((err) => {
          console.log("open Popover message failed in create ", err);
          return EMPTY;
        }),
        switchMap((popover) => {
          const popoverElement = popover as HTMLIonPopoverElement;
          return from(popoverElement.present()).pipe(
            switchMap(() => from(popoverElement.onDidDismiss()))
          )
        }),
        catchError((err) => {
          console.log("open Popover message failed in present ", err);
          return EMPTY;
        })
      )
      .subscribe()
  }

  openPopupConfirm(message: string, buttonTextConfirm: string, buttonTextCancel: string): Observable<any> {
    return from(this.popoverController.create({
      component: PopupConfirmComponent,
      componentProps: {
        message: message,
        buttonTextConfirm: buttonTextConfirm,
        buttonTextCancel: buttonTextCancel,
      },
      cssClass: 'vatReport-modal'
    }))
      .pipe(
        catchError((err) => {
          alert("open Popup Confirm error");
          return EMPTY;
        }),
        switchMap((popover) => from(popover.present())
          .pipe(
            catchError((err) => {
              alert("open Popup Confirm switchMap error");
              console.log(err);
              return EMPTY;
            }),
            switchMap(() => from(popover.onWillDismiss())
              .pipe(
                catchError((err) => {
                  console.log("err in closePopup Confirm: ", err);
                  return EMPTY;
                })
              ))
          )))
  }


  getDefaultMonthValue(
    currentMonth: number,
    periodMode: ReportingPeriodType
  ): string {
    if (periodMode === ReportingPeriodType.MONTHLY) {
      return currentMonth.toString();
    }

    // for BIMONTHLY mode
    const biMonthlyPairs = [1, 3, 5, 7, 9, 11];
    for (const start of biMonthlyPairs) {
      if (currentMonth === start || currentMonth === start + 1) {
        return start.toString(); // must be string because of optionValue="value"
      }
    }

    return '11'; // fallback for Nov–Dec
  }

  // --- פילטר דוחות והנהלת חשבונות (מספר עסק + תאריכים) ---

  /**
   * מחזיר מספר עסק לשימוש בבקשות API.
   * כשהשדה "בחר עסק" מוסתר (עסק יחיד) – משתמש ב-userData או בעסק הראשון.
   * @param userData – יש להעביר מ-AuthService.getUserDataFromLocalStorage() (נדרש כדי למנוע תלות מעגלית)
   */
  getEffectiveBusinessNumber(form: FormGroup | null, formBusinessNumber?: string, userData?: IUserData | null): string {
    const fromForm = formBusinessNumber ?? form?.get('businessNumber')?.value;
    if (fromForm) return fromForm;

    if (userData?.businessStatus === BusinessStatus.SINGLE_BUSINESS && userData?.businessNumber) {
      return userData.businessNumber;
    }

    const businesses = this.businesses();
    return businesses[0]?.businessNumber ?? '';
  }

  /**
   * קורא מהטופס את ערכי התקופה ומחזיר startDate, endDate.
   * תומך: חודשי, דו-חודשי, שנתי, טווח תאריכים.
   */
  getPeriodDatesFromForm(form: FormGroup): { startDate: string; endDate: string } {
    const periodMode = form.get('periodMode')?.value;
    const year = Number(form.get('year')?.value) || new Date().getFullYear();
    const month = Number(form.get('month')?.value);
    const localStartDate = form.get('startDate')?.value ?? '';
    const localEndDate = form.get('endDate')?.value ?? '';

    return this.dateService.getStartAndEndDates(
      periodMode,
      year,
      month,
      localStartDate,
      localEndDate
    );
  }

  /**
   * ברירת מחדל אחידה לתקופה: חודש נוכחי, דו-חודשי עם ינואר-פברואר כברירת מחדל.
   * לשימוש ב-filterConfig.periodDefaults בכל עמודי הדוחות והנהלת חשבונות.
   */
  getDefaultPeriodConfig(overrides?: Partial<PeriodDefaults>): PeriodDefaults {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const defaults: PeriodDefaults = {
      periodMode: ReportingPeriodType.MONTHLY,
      year: currentYear,
      month: String(currentMonth),
      bimonthlyDefaultMonth: '1',
    };
    return overrides ? { ...defaults, ...overrides } : defaults;
  }
}
