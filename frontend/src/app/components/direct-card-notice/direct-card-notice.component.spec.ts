import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { DirectCardNoticeComponent, DirectCardNoticeSession } from './direct-card-notice.component';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { AuthService } from 'src/app/services/auth.service';

describe('Direct card notice', () => {
  let api: any;
  let auth: any;
  let preferences: any;
  const uid = 'direct-notice-test-owner';
  beforeEach(() => {
    localStorage.removeItem(`tm.directCardNotice.${uid}`);
    preferences = { hasDirectCard: true, excludeDirectCardBankTransactionsFromCashflow: false, directCardNoticeDismissed: false, lastLoginAt: '2026-11-04T10:00:00Z' };
    api = {
      getCashflowPreferences: jasmine.createSpy().and.callFake(() => of({ ...preferences })),
      setCashflowPreferences: jasmine.createSpy().and.callFake((value: boolean) => of({ ...preferences, excludeDirectCardBankTransactionsFromCashflow: value })),
      dismissDirectCardNotice: jasmine.createSpy().and.returnValue(of({ dismissed: true })),
    };
    auth = { currentUser: signal({ uid }), isViewingAsClient: signal(false) };
    TestBed.configureTestingModule({
      imports: [DirectCardNoticeComponent],
      providers: [{ provide: TransactionsService, useValue: api }, { provide: AuthService, useValue: auth }],
    }).overrideComponent(DirectCardNoticeComponent, { set: { template: '', imports: [] } });
  });
  afterEach(() => localStorage.removeItem(`tm.directCardNotice.${uid}`));

  function open() {
    const fixture = TestBed.createComponent(DirectCardNoticeComponent);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('opens on normal Angular initialization without an Ionic entry event', () => {
    const fixture = TestBed.createComponent(DirectCardNoticeComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.visible()).toBeTrue();
    expect(api.getCashflowPreferences).toHaveBeenCalledTimes(1);
  });

  it('offers the notice only to detected Direct-card owners who have not enabled or dismissed it', () => {
    const { fixture, component } = open();
    expect(component.visible()).toBeTrue();
    for (const changes of [{ hasDirectCard: false }, { hasDirectCard: true, excludeDirectCardBankTransactionsFromCashflow: true }, { excludeDirectCardBankTransactionsFromCashflow: false, directCardNoticeDismissed: true }]) {
      Object.assign(preferences, changes);
      fixture.componentRef.setInput('refresh', Math.random());
      fixture.detectChanges();
      expect(component.visible()).toBeFalse();
    }
  });

  it('reminds at the next login, but not after navigation or a reload during the same login', () => {
    const { fixture, component } = open();
    component.close();
    expect(component.visible()).toBeFalse();
    fixture.componentRef.setInput('refresh', 1);
    fixture.detectChanges();
    expect(component.visible()).toBeFalse();
    expect(new DirectCardNoticeSession().hasClosed(uid, preferences.lastLoginAt)).toBeTrue();
    preferences.lastLoginAt = '2026-11-05T10:00:00Z';
    fixture.componentRef.setInput('refresh', 2);
    fixture.detectChanges();
    expect(component.visible()).toBeTrue();
    expect(api.dismissDirectCardNotice).not.toHaveBeenCalled();
  });

  it('saves the same cashflow preference and rolls back the checkbox if persistence fails', () => {
    const { component } = open();
    const saved = jasmine.createSpy();
    component.preferenceSaved.subscribe(saved);
    component.savePreference(true);
    expect(api.setCashflowPreferences).toHaveBeenCalledWith(true);
    expect(component.excluded()).toBeTrue();
    expect(saved).toHaveBeenCalledTimes(1);
    api.setCashflowPreferences.and.returnValue(throwError(() => new Error('failed')));
    component.savePreference(false);
    expect(component.excluded()).toBeTrue();
    expect(component.error()).toContain('לא נשמרה');
    expect(saved).toHaveBeenCalledTimes(1);
    expect(api.dismissDirectCardNotice).not.toHaveBeenCalled();
  });

  it('keeps the dialog open on dismissal failure and closes only after the server confirms', () => {
    const { component } = open();
    api.dismissDirectCardNotice.and.returnValue(throwError(() => new Error('failed')));
    component.dismissForever();
    expect(component.visible()).toBeTrue();
    expect(component.error()).toContain('לא ניתן לשמור');
    api.dismissDirectCardNotice.and.returnValue(of({ dismissed: true }));
    component.dismissForever();
    expect(component.visible()).toBeFalse();
    expect(api.setCashflowPreferences).not.toHaveBeenCalled();
  });

  it('blocks duplicate writes and closing while the checkbox is being saved', () => {
    const pending = new Subject<any>();
    api.setCashflowPreferences.and.returnValue(pending);
    const { component } = open();
    component.savePreference(true);
    component.savePreference(false);
    component.close();
    component.dismissForever();
    expect(component.visible()).toBeTrue();
    expect(api.setCashflowPreferences).toHaveBeenCalledTimes(1);
    expect(api.dismissDirectCardNotice).not.toHaveBeenCalled();
    pending.next({ ...preferences, excludeDirectCardBankTransactionsFromCashflow: true });
    expect(component.saving()).toBeFalse();
  });

  it('does not read or write notices in represented-client mode', () => {
    auth.isViewingAsClient.set(true);
    const { component } = open();
    expect(component.visible()).toBeFalse();
    component.savePreference(true);
    component.dismissForever();
    expect(api.getCashflowPreferences).not.toHaveBeenCalled();
    expect(api.setCashflowPreferences).not.toHaveBeenCalled();
    expect(api.dismissDirectCardNotice).not.toHaveBeenCalled();
  });

  it('cancels an old owner read when identity changes', () => {
    const pending = new Subject<any>();
    api.getCashflowPreferences.and.returnValue(pending);
    const { fixture, component } = open();
    auth.currentUser.set(null);
    fixture.detectChanges();
    pending.next(preferences);
    expect(component.visible()).toBeFalse();
  });

  it('waits until banking dialogs and sync finish before offering the option', () => {
    const { fixture, component } = open();
    fixture.componentRef.setInput('blocked', true);
    fixture.detectChanges();
    expect(component.visible()).toBeFalse();
    fixture.componentRef.setInput('blocked', false);
    fixture.detectChanges();
    expect(component.visible()).toBeTrue();
  });
});
