import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { MyCategoriesTabComponent } from './my-categories-tab.component';
import { TransactionsService } from '../../transactions/transactions.page.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { AuthService } from 'src/app/services/auth.service';

describe('Persistent Direct-card preference', () => {
  let service: any;
  beforeEach(() => {
    service = {
      getCashflowPreferences: jasmine.createSpy().and.returnValue(of({ excludeDirectCardBankTransactionsFromCashflow: false })),
      setCashflowPreferences: jasmine.createSpy(),
    };
    TestBed.configureTestingModule({
      imports: [MyCategoriesTabComponent],
      providers: [
        { provide: TransactionsService, useValue: service },
        { provide: ExpenseDataService, useValue: {} },
        { provide: AuthService, useValue: { isViewingAsClient: () => false } },
      ],
    }).overrideComponent(MyCategoriesTabComponent, { set: { template: '', imports: [] } });
  });

  it('loads the saved server preference when opening settings', () => {
    service.getCashflowPreferences.and.returnValue(of({ excludeDirectCardBankTransactionsFromCashflow: true }));
    const component = TestBed.createComponent(MyCategoriesTabComponent).componentInstance;
    expect(component.excludeDirect()).toBeTrue();
    expect(component.cashflowLoaded()).toBeTrue();
    expect(service.getCashflowPreferences).toHaveBeenCalledTimes(1);
  });

  it('offers the setting only when the server has detected a Direct card', () => {
    const component = TestBed.createComponent(MyCategoriesTabComponent).componentInstance;
    expect(component.hasDirectCard()).toBeFalse();
    service.getCashflowPreferences.and.returnValue(of({ hasDirectCard: true, excludeDirectCardBankTransactionsFromCashflow: false }));
    component.loadCashflowPreference();
    expect(component.hasDirectCard()).toBeTrue();
    service.getCashflowPreferences.and.returnValue(of({ hasDirectCard: false, excludeDirectCardBankTransactionsFromCashflow: true }));
    component.loadCashflowPreference();
    expect(component.hasDirectCard()).toBeFalse();
    expect(component.excludeDirect()).toBeTrue();
  });

  it('saves once, blocks concurrent writes and restores the checkbox on failure', () => {
    const pending = new Subject<any>();
    service.setCashflowPreferences.and.returnValue(pending);
    const component = TestBed.createComponent(MyCategoriesTabComponent).componentInstance;
    component.saveCashflowPreference(true);
    expect(component.excludeDirect()).toBeTrue();
    component.saveCashflowPreference(false);
    expect(service.setCashflowPreferences).toHaveBeenCalledOnceWith(true);
    pending.error(new Error('save failed'));
    expect(component.excludeDirect()).toBeFalse();
    expect(component.savingCashflow()).toBeFalse();
    expect(component.cashflowError()).toContain('לא נשמרה');
  });

  it('allows a persisted opt-out without changing classifications', () => {
    service.getCashflowPreferences.and.returnValue(of({ excludeDirectCardBankTransactionsFromCashflow: true }));
    service.setCashflowPreferences.and.returnValue(of({ excludeDirectCardBankTransactionsFromCashflow: false }));
    const component = TestBed.createComponent(MyCategoriesTabComponent).componentInstance;
    component.saveCashflowPreference(false);
    expect(service.setCashflowPreferences).toHaveBeenCalledOnceWith(false);
    expect(component.excludeDirect()).toBeFalse();
  });
  it('invalidates cached cashflow views only after successful persistence', () => {
    const patch = jasmine.createSpy().and.returnValue(of({ excludeDirectCardBankTransactionsFromCashflow: true }));
    const api = new TransactionsService({ patch } as any);
    const changed = jasmine.createSpy();
    api.cashflowPreferencesChanged$.subscribe(changed);
    api.setCashflowPreferences(true).subscribe();
    expect(changed).toHaveBeenCalledTimes(1);
    patch.and.returnValue(throwError(() => new Error('failed')));
    api.setCashflowPreferences(false).subscribe({ error: () => {} });
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
