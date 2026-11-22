import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder, FormControl } from '@angular/forms';
import { convertToParamMap } from '@angular/router';
import { GenericService } from 'src/app/services/generic.service';
import { BusinessStatus, ReportingPeriodType } from 'src/app/shared/enums';
import { PnLReportJournalPage } from './pnl-report-journal.page';

describe('P&L defaults after report-review integration', () => {
  const businesses = [
    { businessNumber: 'first', businessName: 'First business' },
    { businessNumber: 'second', businessName: 'Second business' },
  ];

  function createPage(query: Record<string, string> = {}) {
    const generic = {
      businesses: () => businesses,
      businessSelectItems: signal([]),
      getDefaultPeriodConfig: (defaults: unknown) => ({ ...(defaults as object) }),
    };
    TestBed.configureTestingModule({
      providers: [FormBuilder, { provide: GenericService, useValue: generic }],
    });
    const page = TestBed.runInInjectionContext(() => new PnLReportJournalPage(
      {} as any,
      TestBed.inject(FormBuilder),
      { getUserDataFromLocalStorage: () => ({ businessStatus: BusinessStatus.MULTI_BUSINESS }) } as any,
      generic as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { snapshot: { queryParamMap: convertToParamMap(query) } } as any,
    ));
    spyOn(page, 'getPnLReportData');
    return page;
  }

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 10, 22));
  });

  afterEach(() => jasmine.clock().uninstall());

  it('opens a fresh report on the current annual period without fetching data', async () => {
    const page = createPage();
    await page.ngOnInit();

    const period = page.filterConfig.find(field => field.controlName === 'period');
    expect(period.periodDefaults.periodMode).toBe(ReportingPeriodType.ANNUAL);
    expect(period.periodDefaults.year).toBe(2026);
    expect(page.getPnLReportData).not.toHaveBeenCalled();
  });

  it('keeps the reviewed business and historical monthly period instead of annual defaults', async () => {
    const page = createPage({
      reviewed: '1', businessNumber: 'second',
      startDate: '2025-07-01', endDate: '2025-07-31',
      filterPeriodMode: ReportingPeriodType.MONTHLY,
      filterYear: '2025', filterMonth: '7',
    });
    await page.ngOnInit();

    const period = page.filterConfig.find(field => field.controlName === 'period');
    expect(period.periodDefaults).toEqual(jasmine.objectContaining({
      periodMode: ReportingPeriodType.MONTHLY, year: 2025, month: '7',
    }));
    expect(page.businessNumber()).toBe('second');
    expect(page.businessName()).toBe('Second business');
    expect(page.getPnLReportData).toHaveBeenCalledOnceWith('2025-07-01', '2025-07-31', 'second');
  });

  it('clears the previous result when the selected period changes', async () => {
    const page = createPage();
    page.form.addControl('periodMode', new FormControl(ReportingPeriodType.ANNUAL));
    await page.ngOnInit();
    page.pnlReport = {} as any;
    page.totalExpense = 100;
    page.isRequestSent.set(true);
    page.osekZair.set(true);

    page.form.get('periodMode').setValue(ReportingPeriodType.MONTHLY);

    expect(page.pnlReport).toBeUndefined();
    expect(page.totalExpense).toBe(0);
    expect(page.isRequestSent()).toBeFalse();
    expect(page.osekZair()).toBeFalse();
  });
});
