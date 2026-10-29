import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { MessageService } from 'primeng/api';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AccessHandlerService } from 'src/app/services/access-handler.service';
import { AuthService } from 'src/app/services/auth.service';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { DateService } from 'src/app/services/date.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';
import { SyncStatusService } from 'src/app/services/sync-status.service';
import { TransactionsPage } from './transactions.page';
import { TransactionsService } from './transactions.page.service';

describe('transactions disconnected banking state', () => {
  let fixture: ComponentFixture<TransactionsPage>; let page: TransactionsPage;
  let profile: any; let ownerUpdates: BehaviorSubject<any>; let selected: BehaviorSubject<string | null>;
  let router: any; let gate: any; let sync: any; let transactions: any;
  beforeEach(async () => {
    profile = { firebaseId: 'owner', hasOpenBanking: false };
    ownerUpdates = new BehaviorSubject(profile); selected = new BehaviorSubject<string | null>(null);
    router = { navigate: jasmine.createSpy() }; gate = { handleFeatureAccess: jasmine.createSpy().and.returnValue({ allowed: true }) };
    sync = { getSyncStageStream: jasmine.createSpy().and.returnValue(of({ stageState: { processStatus: 'running' } })), triggerSync: jasmine.createSpy() };
    transactions = { filterData: signal<any>({ oldFilter: true }), getAllBills: jasmine.createSpy(), accountsList: signal([]),
      getIncomeTransactionsData: jasmine.createSpy().and.returnValue(of([])), getExpenseTransactionsData: jasmine.createSpy().and.returnValue(of([])) };
    await TestBed.configureTestingModule({ declarations: [TransactionsPage], imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA], providers: [FormBuilder,
      { provide: Router, useValue: router }, { provide: ModalController, useValue: {} },
      { provide: DateService, useValue: { getStartAndEndDates: () => ({ startDate: '2026-10-01', endDate: '2026-10-23' }) } },
      { provide: TransactionsService, useValue: transactions },
      { provide: AuthService, useValue: { ownerProfileUpdates$: ownerUpdates, getUserDataFromLocalStorage: () => profile,
        getCurrentAuthUser: () => ({ uid: 'owner' }), isViewingAsClient: () => !!selected.value } },
      { provide: ClientPanelService, useValue: { selectedClientId$: selected, getSelectedClientId: () => selected.value } },
      { provide: GenericService, useValue: { businessSelectItems: () => [], isMobile: () => false } },
      { provide: AccessHandlerService, useValue: gate }, { provide: ExpenseDataService, useValue: {} },
      { provide: SyncStatusService, useValue: sync }, { provide: MessageService, useValue: { add: jasmine.createSpy() } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(TransactionsPage); page = fixture.componentInstance;
    spyOn(page, 'getCategory').and.stub(); fixture.detectChanges();
  });
  it('renders the yellow banner and supplies the exact empty copy to both tables without starting sync', () => {
    expect(fixture.nativeElement.querySelector('.banking-banner')).not.toBeNull();
    const tables = [...fixture.nativeElement.querySelectorAll('app-generic-table')] as any[];
    expect(tables.length).toBe(2); tables.forEach(table => expect(table.emptyText).toBe('אין נתונים כי אין חיבור לבנקאות פתוחה'));
    expect(sync.getSyncStageStream).not.toHaveBeenCalled(); expect(transactions.filterData()).toBeNull();
    page.filterData.set({ oldFilter: true }); page.selectedValue = [];
    expect(page.tableEmptyText()).toBe('אין נתונים כי אין חיבור לבנקאות פתוחה');
  });
  it('requires owner access and explicit consent before the existing enrollment route', () => {
    page.connectToOpenBanking(); expect(page.consentDialogVisible()).toBeTrue();
    page.confirmConsentAndConnect(); expect(router.navigate).not.toHaveBeenCalled();
    page.consentChecked.set(true); page.confirmConsentAndConnect(); expect(router.navigate).toHaveBeenCalledWith(['/billing/open-banking']);
    router.navigate.calls.reset(); gate.handleFeatureAccess.and.returnValue({ allowed: false });
    page.confirmConsentAndConnect(); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('uses the represented profile only and provides no owner connection CTA', () => {
    selected.next('client'); fixture.detectChanges();
    expect(page.hasOpenBanking()).toBeNull(); expect(fixture.nativeElement.querySelector('.banking-banner')).toBeNull();
    profile = { firebaseId: 'client', hasOpenBanking: false }; page.ionViewWillEnter(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.banking-banner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.banking-banner app-p-button')).toBeNull();
    ownerUpdates.next({ firebaseId: 'owner', hasOpenBanking: true }); expect(page.hasOpenBanking()).toBeFalse();
    page.connectToOpenBanking(); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('preserves the default copy for connected empty/filter/failure/loading states', () => {
    profile = { firebaseId: 'owner', hasOpenBanking: true }; ownerUpdates.next(profile); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.banking-banner')).toBeNull();
    expect(page.tableEmptyText()).toBe('אויש, לא מצאנו את מה שחיפשת');
    page.syncProcessStatus.set('failed'); expect(page.tableEmptyText()).toBe('אויש, לא מצאנו את מה שחיפשת');
    page.isLoadingStateTable.set(true); expect(page.tableEmptyText()).toBe('אויש, לא מצאנו את מה שחיפשת');
  });
  it('clears retained rows and cancels late reads when the authoritative owner becomes disconnected', () => {
    profile = { firebaseId: 'owner', hasOpenBanking: true }; ownerUpdates.next(profile); page.syncProcessStatus.set(null);
    const income = new Subject<any[]>(); const expenses = new Subject<any[]>();
    transactions.getIncomeTransactionsData.and.returnValue(income); transactions.getExpenseTransactionsData.and.returnValue(expenses);
    page.filteredExpensesData.set([{ id: 1 }]); page.filteredIncomesData.set([{ id: 2 }]); page.getTransactions(null);
    expect(page.isLoadingStateTable()).toBeTrue();
    profile = { firebaseId: 'owner', hasOpenBanking: false }; ownerUpdates.next(profile);
    income.next([{ id: 8 }]); expenses.next([{ id: 9 }]);
    expect(page.filteredExpensesData()).toEqual([]); expect(page.filteredIncomesData()).toEqual([]);
    expect(page.syncProcessStatus()).toBeNull(); expect(page.isLoadingStateTable()).toBeFalse();
    expect(page.tableEmptyText()).toBe('אין נתונים כי אין חיבור לבנקאות פתוחה');
    page.onSyncTriggered(); expect(sync.triggerSync).not.toHaveBeenCalled();
  });
  it('ignores a late sync-retry error after authoritative disconnection', () => {
    profile = { firebaseId: 'owner', hasOpenBanking: true }; ownerUpdates.next(profile);
    const retry = new Subject<any>(); sync.triggerSync.and.returnValue(retry);
    page.onSyncTriggered(); expect(page.syncProcessStatus()).toBe('running');
    profile = { firebaseId: 'owner', hasOpenBanking: false }; ownerUpdates.next(profile);
    retry.error(new Error('late sync error'));
    expect(page.syncProcessStatus()).toBeNull(); expect(page.filteredExpensesData()).toEqual([]);
    expect(page.filteredIncomesData()).toEqual([]); expect(page.tableEmptyText()).toBe('אין נתונים כי אין חיבור לבנקאות פתוחה');
  });
});
