import { signal } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { BillingStateService } from './services/billing-state.service';
import { AppRefreshService } from './services/pwa/app-refresh.service';
import { AuthService } from './services/auth.service';
import { GenericService } from './services/generic.service';

describe('App reconnect billing recovery', () => {
  const reconnectedAt = signal(0);
  let requests: Subject<any>[];
  let get: jasmine.Spy;
  let businessLoad: jasmine.Spy;
  let billing: BillingStateService;

  beforeEach(() => {
    reconnectedAt.set(0);
    requests = [];
    get = jasmine.createSpy('get').and.callFake(() => {
      const response = new Subject<any>(); requests.push(response); return response;
    });
    businessLoad = jasmine.createSpy('loadBusinessesFromServer').and.resolveTo();
    TestBed.configureTestingModule({ providers: [BillingStateService, AppRefreshService,
      { provide: HttpClient, useValue: { get } },
      { provide: AuthService, useValue: { isLoggedIn: true } },
      { provide: GenericService, useValue: { loadBusinessesFromServer: businessLoad } },
    ] });
    billing = TestBed.inject(BillingStateService);
    const host = { networkStatus: { reconnectedAt }, appRefresh: TestBed.inject(AppRefreshService) };
    // Run the real root recovery effect without booting routes, Firebase or templates.
    TestBed.runInInjectionContext(() => (AppComponent.prototype as any).recoverOnReconnect.call(host));
    TestBed.flushEffects();
  });

  function finish(index: number): void {
    requests[index].next({ hasSubscription: true, subscription: { status: 'ACTIVE' } });
    requests[index].complete();
    flushMicrotasks();
    TestBed.flushEffects();
  }

  it('does not fetch on the initial online state', () => {
    expect(get).not.toHaveBeenCalled();
    expect(businessLoad).not.toHaveBeenCalled();
  });

  it('does not turn a successful billing response or later state update into another refresh', fakeAsync(() => {
    reconnectedAt.set(1); TestBed.flushEffects();
    expect(get).toHaveBeenCalledTimes(1);
    finish(0);
    expect(get).toHaveBeenCalledTimes(1);
    billing.billingState.set({ hasSubscription: true } as any);
    billing.error.set('later unrelated error');
    TestBed.flushEffects(); flushMicrotasks();
    expect(get).toHaveBeenCalledTimes(1);
    expect(businessLoad).toHaveBeenCalledTimes(1);
  }));

  it('does not loop after a failed recovery, and retries on the next real reconnect', fakeAsync(() => {
    reconnectedAt.set(1); TestBed.flushEffects();
    requests[0].error({ status: 503 }); flushMicrotasks(); TestBed.flushEffects();
    expect(get).toHaveBeenCalledTimes(1);
    reconnectedAt.set(2); TestBed.flushEffects();
    expect(get).toHaveBeenCalledTimes(2);
    finish(1);
    expect(get).toHaveBeenCalledTimes(2);
  }));

  it('refreshes once for each subsequent completed outage', fakeAsync(() => {
    reconnectedAt.set(1); TestBed.flushEffects(); finish(0);
    reconnectedAt.set(2); TestBed.flushEffects(); finish(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(businessLoad).toHaveBeenCalledTimes(2);
  }));
});
