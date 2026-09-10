import { NO_ERRORS_SCHEMA, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from 'src/app/services/auth.service';
import { DateService } from 'src/app/services/date.service';
import { FilesService } from 'src/app/services/files.service';
import { GenericService } from 'src/app/services/generic.service';
import { ReportReviewService } from 'src/app/services/report-review.service';
import { BusinessStatus, BusinessType, ReportingPeriodType, VATReportingType } from 'src/app/shared/enums';
import { Business } from 'src/app/shared/interface';
import {
  getVatReportBusinessSelectItems,
  getVatReportEligibleBusinesses,
} from 'src/app/shared/vat-report-eligibility';
import { TransactionsService } from '../transactions/transactions.page.service';
import { VatReportJournalService } from './vat-report-journal.service';
import { VatReportJournalPage } from './vat-report-journal.page';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { of } from 'rxjs';

const business = (
  businessNumber: string,
  businessType: BusinessType,
  vatReportingType: VATReportingType,
): Business => ({
  businessNumber,
  businessName: businessNumber,
  businessType,
  vatReportingType,
} as Business);

describe('VatReportJournalPage business selection', () => {
  let fixture: ComponentFixture<VatReportJournalPage>;
  let component: VatReportJournalPage;
  let router: jasmine.SpyObj<Router>;
  let messages: jasmine.SpyObj<MessageService>;
  let files: jasmine.SpyObj<FilesService>;
  let expenseData: jasmine.SpyObj<ExpenseDataService>;
  let genericService: any;
  const businesses = signal<Business[]>([]);
  const eligibleBusinesses = computed(() => getVatReportEligibleBusinesses(businesses()));
  const eligibleOptions = computed(() => getVatReportBusinessSelectItems(businesses()));

  beforeEach(async () => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    messages = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    files = jasmine.createSpyObj<FilesService>('FilesService', [
      'previewFile',
      'previewFile1',
      'downloadFirebaseFile',
      'downloadFile',
    ]);
    files.previewFile.and.returnValue(of(undefined));
    expenseData = jasmine.createSpyObj<ExpenseDataService>('ExpenseDataService', [
      'getSourceDocumentFile',
    ]);
    genericService = {
      businesses: businesses.asReadonly(),
      vatReportEligibleBusinesses: eligibleBusinesses,
      vatReportBusinessSelectItems: eligibleOptions,
      loadBusinessesFromServer: jasmine.createSpy('loadBusinessesFromServer').and.resolveTo(),
      getDefaultMonthValue: () => '1',
      getDefaultPeriodConfig: (defaults: unknown) => defaults,
      getLoader: jasmine.createSpy('getLoader').and.returnValue(of(undefined)),
      dismissLoader: jasmine.createSpy('dismissLoader'),
    };

    await TestBed.configureTestingModule({
      declarations: [VatReportJournalPage],
      providers: [
        FormBuilder,
        {
          provide: GenericService,
          useValue: genericService,
        },
        {
          provide: AuthService,
          useValue: {
            getUserDataFromLocalStorage: () => ({ businessStatus: BusinessStatus.MULTI_BUSINESS }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } },
        },
        { provide: Router, useValue: router },
        { provide: MessageService, useValue: messages },
        { provide: ConfirmationService, useValue: {} },
        { provide: ReportReviewService, useValue: {} },
        { provide: DateService, useValue: {} },
        { provide: FilesService, useValue: files },
        { provide: ExpenseDataService, useValue: expenseData },
        { provide: VatReportJournalService, useValue: {} },
        { provide: ModalController, useValue: {} },
        { provide: TransactionsService, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(VatReportJournalPage, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(VatReportJournalPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    businesses.set([]);
  });

  it('redirects direct navigation when there are zero eligible businesses', async () => {
    businesses.set([
      business('exempt', BusinessType.EXEMPT, VATReportingType.NOT_REQUIRED),
    ]);

    await component.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/reports']);
    expect(messages.add).toHaveBeenCalled();
    expect(component.filterConfig).toEqual([]);
  });

  it('auto-selects one eligible business and omits the business filter', async () => {
    businesses.set([
      business('licensed', BusinessType.LICENSED, VATReportingType.MONTHLY_REPORT),
    ]);

    await component.ngOnInit();

    expect(component.businessNumber()).toBe('licensed');
    expect(component.reportBusinessName()).toBe('licensed');
    expect(component.filterConfig.some((field) => field.controlName === 'businessNumber')).toBeFalse();
    const period = component.filterConfig.find((field) => field.controlName === 'period');
    expect(period?.allowedPeriodModes).toEqual([ReportingPeriodType.MONTHLY]);
    expect(period?.periodDefaults?.periodMode).toBe(ReportingPeriodType.MONTHLY);
  });

  it('uses only the bimonthly selector for a bimonthly business', async () => {
    businesses.set([
      business('licensed', BusinessType.LICENSED, VATReportingType.DUAL_MONTH_REPORT),
    ]);

    await component.ngOnInit();

    const period = component.filterConfig.find((field) => field.controlName === 'period');
    expect(period?.allowedPeriodModes).toEqual([ReportingPeriodType.BIMONTHLY]);
    expect(period?.periodDefaults?.periodMode).toBe(ReportingPeriodType.BIMONTHLY);
  });

  it('shows only eligible choices for multiple eligible businesses in a mixed account', async () => {
    businesses.set([
      business('exempt', BusinessType.EXEMPT, VATReportingType.NOT_REQUIRED),
      business('licensed', BusinessType.LICENSED, VATReportingType.MONTHLY_REPORT),
      business('company', BusinessType.LIMITED_COMPANY, VATReportingType.DUAL_MONTH_REPORT),
    ]);

    await component.ngOnInit();

    const field = component.filterConfig.find((item) => item.controlName === 'businessNumber');
    expect(field).toBeDefined();
    expect((field.options as typeof eligibleOptions)().map((item) => item.value)).toEqual([
      'licensed',
      'company',
    ]);
  });

  it('marks Drive-linked VAT rows as attached while preserving manual-file priority', () => {
    (component as any).setVatReportRows([
      {
        id: 1,
        totalVatPayable: 10,
        file: 'expenses/manual.pdf',
        sourceDocumentId: 11,
        sourceDocumentFileName: 'drive-a.pdf',
      },
      {
        id: 2,
        totalVatPayable: 20,
        file: '',
        sourceDocumentId: 12,
        sourceDocumentFileName: 'drive-b.pdf',
      },
    ]);

    expect(component.rows[0].fileName).toBe('expenses/manual.pdf');
    expect(component.rows[1].fileName).toBe('drive-b.pdf');
  });

  it('previews the Drive source document when no manual file exists', () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    expenseData.getSourceDocumentFile.and.returnValue(of(blob));

    component.onPreviewFileClicked({ id: 17, file: '', sourceDocumentId: 42 });

    expect(expenseData.getSourceDocumentFile).toHaveBeenCalledWith(17);
    expect(files.previewFile1).toHaveBeenCalledWith(blob);
    expect(files.previewFile).not.toHaveBeenCalled();
  });

  it('keeps the manual file as the preview source when both links exist', () => {
    component.onPreviewFileClicked({
      id: 17,
      file: 'expenses/manual.pdf',
      sourceDocumentId: 42,
    });

    expect(files.previewFile).toHaveBeenCalledWith('expenses/manual.pdf');
    expect(expenseData.getSourceDocumentFile).not.toHaveBeenCalled();
  });
});
