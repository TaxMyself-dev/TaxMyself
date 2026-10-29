import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import {
  AdminPanelService,
  AdminTaxAdvanceReport,
  AdminTaxBusiness,
  AdminTaxPnl,
} from 'src/app/services/admin-panel.service';
import { calculateTaxFilePlanning, TaxFilePlanningResult } from './tax-file-planning';
import { SELF_EMPLOYED_GUIDE_FIGURES } from './self-employed-guide.figures';

interface TaxFileUser {
  firebaseId: string;
  fName?: string;
  lName?: string;
  email?: string;
  id?: string | null;
  spouseId?: string | null;
  spouseFName?: string | null;
  spouseLName?: string | null;
  isCompany?: boolean;
}

type TaxOwner = 'client' | 'spouse';

interface BusinessReport {
  business: AdminTaxBusiness;
  owner: TaxOwner;
  pnl: AdminTaxPnl | null;
  advance: AdminTaxAdvanceReport | null;
  failed: boolean;
}

@Component({
  selector: 'app-admin-tax-file',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './admin-tax-file.component.html',
  styleUrls: ['./admin-tax-file.component.scss'],
})
export class AdminTaxFileComponent implements OnInit {
  readonly taxYear = SELF_EMPLOYED_GUIDE_FIGURES.taxYear;

  users: TaxFileUser[] = [];
  businesses: AdminTaxBusiness[] = [];
  businessReports: BusinessReport[] = [];
  selectedUserId = '';

  monthlySalary = 0;
  creditPoints = 2.25;
  incomeTaxPaid: number | null = null;
  nationalInsurancePaid: number | null = null;

  showAccuracyInputs = false;
  includeSpouse = false;
  spouseMonthlySalary = 0;
  spouseAnnualBusinessProfit = 0;
  spouseCreditPoints = 2.25;
  spouseNationalInsuranceRequired = false;

  loadingUsers = false;
  loadingReport = false;
  errorMessage = '';

  constructor(private readonly adminPanelService: AdminPanelService) {}

  ngOnInit(): void {
    this.loadingUsers = true;
    this.adminPanelService.getAllUsers()
      .pipe(
        catchError(() => {
          this.errorMessage = 'לא הצלחנו לטעון את רשימת הלקוחות.';
          return of([]);
        }),
        finalize(() => this.loadingUsers = false),
      )
      .subscribe((users: TaxFileUser[]) => {
        this.users = (users ?? [])
          .filter(user => !!user.firebaseId && !user.isCompany)
          .sort((a, b) => this.userLabel(a).localeCompare(this.userLabel(b), 'he'));
      });
  }

  get selectedUser(): TaxFileUser | null {
    return this.users.find(user => user.firebaseId === this.selectedUserId) ?? null;
  }

  get clientReports(): BusinessReport[] {
    return this.businessReports.filter(report => report.owner === 'client');
  }

  get spouseReports(): BusinessReport[] {
    return this.businessReports.filter(report => report.owner === 'spouse');
  }

  get hasSpouseBusinesses(): boolean {
    return this.spouseReports.length > 0;
  }

  get clientOwnerLabel(): string {
    return [this.selectedUser?.fName, this.selectedUser?.lName].filter(Boolean).join(' ') || 'בעל/ת החשבון';
  }

  get result(): TaxFilePlanningResult | null {
    return this.calculateOwnerPlan(
      this.clientReports,
      this.monthlySalary,
      this.creditPoints,
      this.incomeTaxPaid,
      this.nationalInsurancePaid,
    );
  }

  get spouseResult(): TaxFilePlanningResult | null {
    if (this.hasSpouseBusinesses) {
      return this.calculateOwnerPlan(this.spouseReports, this.spouseMonthlySalary, this.spouseCreditPoints, null, null);
    }
    if (!this.includeSpouse) return null;
    return calculateTaxFilePlanning({
      actualIncome: this.spouseAnnualBusinessProfit,
      actualExpenses: 0,
      actualProfit: this.spouseAnnualBusinessProfit,
      yearProgress: 1,
      monthlySalary: this.spouseMonthlySalary,
      creditPoints: this.spouseCreditPoints,
      nationalInsuranceRequired: this.spouseNationalInsuranceRequired,
    });
  }

  get actualIncome(): number {
    return this.sumReports(this.clientReports, report => report.pnl?.income);
  }

  get actualExpenses(): number {
    return this.sumReports(this.clientReports, report => this.reportExpenses(report.pnl));
  }

  get actualProfit(): number {
    return this.sumReports(this.clientReports, report => report.pnl?.netProfitBeforeTax);
  }

  get currentAdvanceTarget(): number {
    return this.sumReports(this.clientReports, report => report.advance?.totalAdvanceTax);
  }

  get clientInsuranceStatusLabel(): string {
    const status = this.ownerInsuranceStatus(this.clientReports);
    if (status === true) return 'עונה להגדרה';
    if (status === false) return 'לא עונה להגדרה';
    return 'הסטטוס לא הוגדר בכל העסקים';
  }

  get yearProgress(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear() + 1, 0, 1);
    return Math.min(1, Math.max(1 / 12, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
  }

  get monthsRemaining(): number {
    return Math.max(1, 12 - new Date().getMonth());
  }

  get amountToReserve(): number {
    const result = this.result;
    if (!result) return 0;
    const estimatedBusinessTax = Math.max(0, result.incomeTax - result.estimatedSalaryTax);
    return result.totalKnownBalance ?? (estimatedBusinessTax + result.nationalInsurance);
  }

  get monthlyReserve(): number {
    return Math.round(this.amountToReserve / this.monthsRemaining);
  }

  get paymentsKnown(): boolean {
    return this.incomeTaxPaid != null && this.nationalInsurancePaid != null;
  }

  onClientChange(): void {
    this.businesses = [];
    this.businessReports = [];
    this.errorMessage = '';
    this.resetPlanningInputs();
    if (!this.selectedUserId) return;

    this.loadingReport = true;
    this.adminPanelService.getUserBusinesses(this.selectedUserId)
      .pipe(catchError(() => {
        this.errorMessage = 'לא הצלחנו לטעון את העסקים של הלקוח.';
        return of([]);
      }))
      .subscribe(businesses => {
        this.businesses = (businesses ?? []).filter(business => !!business.businessNumber);
        if (!this.businesses.length) {
          this.loadingReport = false;
          return;
        }
        this.loadAllReports();
      });
  }

  loadAllReports(): void {
    if (!this.selectedUserId) return;
    const now = new Date();
    const startDate = `${now.getFullYear()}-01-01`;
    const endDate = this.localDate(now);
    const requests = this.businesses.map(business => forkJoin({
      pnl: this.adminPanelService
        .getUserPnl(this.selectedUserId, business.businessNumber!, startDate, endDate)
        .pipe(catchError(() => of(null))),
      advance: this.adminPanelService
        .getUserAdvanceTaxReport(this.selectedUserId, business.businessNumber!, startDate, endDate)
        .pipe(catchError(() => of(null))),
    }));

    forkJoin(requests)
      .pipe(finalize(() => this.loadingReport = false))
      .subscribe(results => {
        this.businessReports = this.businesses.map((business, index) => ({
          business,
          owner: this.businessOwner(business),
          pnl: results[index].pnl,
          advance: results[index].advance,
          failed: !results[index].pnl,
        }));
        this.includeSpouse = this.hasSpouseBusinesses;
        if (this.businessReports.some(report => report.failed)) {
          this.errorMessage = 'חלק מנתוני העסקים לא נטענו. החישוב מבוסס רק על הנתונים הזמינים.';
        }
      });
  }

  userLabel(user: TaxFileUser): string {
    const name = [user.fName, user.lName].filter(Boolean).join(' ').trim();
    return name ? `${name} · ${user.email ?? ''}` : (user.email ?? user.firebaseId);
  }

  businessLabel(business: AdminTaxBusiness): string {
    return business.businessName?.trim() || business.businessNumber || 'עסק ללא שם';
  }

  ownerLabel(report: BusinessReport): string {
    if (report.owner === 'spouse') {
      return [this.selectedUser?.spouseFName, this.selectedUser?.spouseLName].filter(Boolean).join(' ') || 'בן/בת הזוג';
    }
    return [this.selectedUser?.fName, this.selectedUser?.lName].filter(Boolean).join(' ') || 'בעל/ת החשבון';
  }

  businessTypeLabel(type: string | null): string {
    const labels: Record<string, string> = {
      EXEMPT: 'עוסק פטור', LICENSED: 'עוסק מורשה', SMALL_BUSINESS: 'עסק זעיר',
      LIMITED_COMPANY: 'חברה בע״מ', EXEMPT_PARTNERSHIP: 'שותפות פטורה',
      AUTHORIZED_PARTNERSHIP: 'שותפות מורשית',
    };
    return type ? (labels[type] ?? type) : 'סוג עסק לא הוגדר';
  }

  nationalInsuranceStatus(business: AdminTaxBusiness): string {
    if (business.nationalInsRequired === true) return 'עונה להגדרה';
    if (business.nationalInsRequired === false) return 'לא עונה להגדרה';
    return 'לא הוגדר';
  }

  formatAdvancePercent(value: number | null | undefined): string {
    return value == null ? 'לא הוגדר' : `${Number(value).toLocaleString('he-IL')}%`;
  }

  reportExpenses(pnl: AdminTaxPnl | null): number {
    return (pnl?.expenses ?? []).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null) return 'לא ידוע';
    return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(value))} ₪`;
  }

  formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  private calculateOwnerPlan(
    reports: BusinessReport[], monthlySalary: number, creditPoints: number,
    incomeTaxPaid: number | null, nationalInsurancePaid: number | null,
  ): TaxFilePlanningResult | null {
    const available = reports.filter(report => !!report.pnl);
    if (!available.length) return null;
    return calculateTaxFilePlanning({
      actualIncome: this.sumReports(available, report => report.pnl?.income),
      actualExpenses: this.sumReports(available, report => this.reportExpenses(report.pnl)),
      actualProfit: this.sumReports(available, report => report.pnl?.netProfitBeforeTax),
      yearProgress: this.yearProgress,
      monthlySalary,
      creditPoints,
      incomeTaxPaid,
      nationalInsurancePaid,
      nationalInsuranceRequired: this.ownerInsuranceStatus(available),
    });
  }

  private ownerInsuranceStatus(reports: BusinessReport[]): boolean | null {
    const statuses = reports.map(report => report.business.nationalInsRequired);
    if (statuses.some(status => status === true)) return true;
    if (statuses.length && statuses.every(status => status === false)) return false;
    return null;
  }

  private businessOwner(business: AdminTaxBusiness): TaxOwner {
    const spouseId = this.selectedUser?.spouseId?.trim();
    return spouseId && business.businessNumber === spouseId ? 'spouse' : 'client';
  }

  private sumReports(reports: BusinessReport[], value: (report: BusinessReport) => unknown): number {
    return reports.reduce((sum, report) => sum + (Number(value(report)) || 0), 0);
  }

  private resetPlanningInputs(): void {
    this.monthlySalary = 0;
    this.creditPoints = 2.25;
    this.incomeTaxPaid = null;
    this.nationalInsurancePaid = null;
    this.showAccuracyInputs = false;
    this.includeSpouse = false;
    this.spouseMonthlySalary = 0;
    this.spouseAnnualBusinessProfit = 0;
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
