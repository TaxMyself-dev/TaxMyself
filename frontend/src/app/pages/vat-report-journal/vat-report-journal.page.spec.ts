import { NO_ERRORS_SCHEMA, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from 'src/app/services/auth.service';
import { DateService } from 'src/app/services/date.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { FilesService } from 'src/app/services/files.service';
import { GenericService } from 'src/app/services/generic.service';
import { ReportReviewService } from 'src/app/services/report-review.service';
import { BusinessStatus, BusinessType, VATReportingType } from 'src/app/shared/enums';
import { Business } from 'src/app/shared/interface';
import {
  getVatReportBusinessSelectItems,
  getVatReportEligibleBusinesses,
} from 'src/app/shared/vat-report-eligibility';
import { TransactionsService } from '../transactions/transactions.page.service';
import { VatReportJournalService } from './vat-report-journal.service';
import { VatReportJournalPage } from './vat-report-journal.page';

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
  const businesses = signal<Business[]>([]);
  const eligibleBusinesses = computed(() => getVatReportEligibleBusinesses(businesses()));
  const eligibleOptions = computed(() => getVatReportBusinessSelectItems(businesses()));

  beforeEach(async () => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    messages = jasmine.createSpyObj<MessageService>('MessageService', ['add']);

    await TestBed.configureTestingModule({
      declarations: [VatReportJournalPage],
      providers: [
        FormBuilder,
        {
          provide: GenericService,
          useValue: {
            businesses: businesses.asReadonly(),
            vatReportEligibleBusinesses: eligibleBusinesses,
            vatReportBusinessSelectItems: eligibleOptions,
            loadBusinessesFromServer: jasmine.createSpy('loadBusinessesFromServer').and.resolveTo(),
            getDefaultMonthValue: () => '1',
            getDefaultPeriodConfig: (defaults: unknown) => defaults,
          },
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
        { provide: FilesService, useValue: {} },
        { provide: VatReportJournalService, useValue: {} },
        { provide: ExpenseDataService, useValue: {} },
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
    expect(component.filterConfig.some((field) => field.controlName === 'businessNumber')).toBeFalse();
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
});
