import { HttpContext, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject, firstValueFrom, of, Subject, throwError } from 'rxjs';
import { AuthInterceptor } from '../interceptors/auth.interceptor';
import { OWNER_PROFILE_REQUEST } from '../shared/auth/owner-profile-request';
import { AuthService } from './auth.service';
import { GenericService } from './generic.service';
import { StartupService } from './startup.service';

describe('fresh signed-in owner profile', () => {
  let auth: AuthService; let http: any; let identity: any; let firebase: BehaviorSubject<any>;
  let cached: any;
  beforeEach(() => {
    cached = { firebaseId: 'owner', hasOpenBanking: true };
    firebase = new BehaviorSubject({ uid: 'owner' });
    http = { get: jasmine.createSpy().and.returnValue(of({ firebaseId: 'owner', hasOpenBanking: false })) };
    identity = { setAuthenticatedUid: jasmine.createSpy(), getUserData: () => cached,
      setUserData: jasmine.createSpy().and.callFake(profile => { cached = profile; return true; }) };
    auth = new AuthService({} as any, {} as any, { authState: firebase } as any, {} as any, http, {} as any, {} as any, identity);
  });
  it('revalidates an already cached owner once per browser bootstrap before readiness', async () => {
    const response = new Subject<any>(); http.get.and.returnValue(response);
    TestBed.configureTestingModule({ providers: [ { provide: AuthService, useValue: auth },
      { provide: GenericService, useValue: { isLoading: signal(false), dismissLoader: jasmine.createSpy() } } ] });
    const startup = TestBed.inject(StartupService);
    const first = startup.whenReady(); const second = startup.whenReady();
    await Promise.resolve();
    expect(first).toBe(second); expect(http.get).toHaveBeenCalledTimes(1);
    expect(startup.ready()).toBeFalse();
    const [url, options] = http.get.calls.mostRecent().args;
    expect(url).toMatch(/auth\/signin$/); expect(options.context.get(OWNER_PROFILE_REQUEST)).toBeTrue();
    response.next({ firebaseId: 'owner', hasOpenBanking: false }); response.complete();
    await first; expect(startup.ready()).toBeTrue(); expect(cached.hasOpenBanking).toBeFalse();
  });
  it('drops stale responses when a newer owner refresh has already applied', () => {
    const oldResponse = new Subject<any>(); const latestResponse = new Subject<any>();
    http.get.and.returnValues(oldResponse, latestResponse);
    const emitted: any[] = []; auth.ownerProfileUpdates$.subscribe(value => value && emitted.push(value));
    auth.refreshOwnerProfile().subscribe(); auth.refreshOwnerProfile().subscribe();
    latestResponse.next({ firebaseId: 'owner', hasOpenBanking: false }); latestResponse.complete();
    oldResponse.next({ firebaseId: 'owner', hasOpenBanking: true }); oldResponse.complete();
    expect(cached.hasOpenBanking).toBeFalse(); expect(emitted.length).toBe(1);
  });
  it('rejects identity changes and wrong-owner responses without clearing the cache', () => {
    const pending = new Subject<any>(); http.get.and.returnValue(pending);
    auth.refreshOwnerProfile().subscribe(); firebase.next({ uid: 'another-owner' });
    pending.next({ firebaseId: 'owner', hasOpenBanking: false }); pending.complete();
    expect(identity.setUserData).not.toHaveBeenCalled();
    http.get.and.returnValue(of({ firebaseId: 'represented-client' })); auth.refreshOwnerProfile().subscribe();
    expect(identity.setUserData).not.toHaveBeenCalled();
  });
  it('keeps the cached profile and Firebase session after a transient read failure', async () => {
    http.get.and.returnValue(throwError(() => new Error('offline')));
    expect(await firstValueFrom(auth.refreshOwnerProfile())).toBeNull();
    expect(cached.hasOpenBanking).toBeTrue(); expect(auth.isLoggedIn).toBeTrue();
  });
  it('invalidates a pending read across logout and login with the same Firebase UID', () => {
    const response = new Subject<any>(); http.get.and.returnValue(response);
    auth.refreshOwnerProfile().subscribe();
    firebase.next(null); firebase.next({ uid: 'owner' });
    response.next({ firebaseId: 'owner', hasOpenBanking: false }); response.complete();
    expect(identity.setUserData).not.toHaveBeenCalled();
    let published: any = 'unread'; auth.ownerProfileUpdates$.subscribe(profile => published = profile);
    expect(published).toBeNull();
  });
  it('updates the real-owner cache without replacing a represented-client overlay', async () => {
    (auth as any).viewAsUserData = { firebaseId: 'client', hasOpenBanking: true };
    await firstValueFrom(auth.refreshOwnerProfile());
    expect(cached.firebaseId).toBe('owner'); expect(cached.hasOpenBanking).toBeFalse();
    expect(auth.getUserDataFromLocalStorage()?.firebaseId).toBe('client');
  });
  it('omits delegated headers only for explicit owner requests and preserves normal delegation', async () => {
    const interceptor = new AuthInterceptor({ idToken: of('token') } as any,
      { getActiveBusinessNumber: () => 'represented-business' } as any,
      { getSelectedClientId: () => 'client' } as any, {} as any);
    const next = { handle: jasmine.createSpy().and.returnValue(of(new HttpResponse({ status: 200 }))) };
    const owner = new HttpRequest('GET', '/auth/signin', { context: new HttpContext().set(OWNER_PROFILE_REQUEST, true) });
    await firstValueFrom(interceptor.intercept(owner, next));
    let sent = next.handle.calls.mostRecent().args[0];
    expect(sent.headers.get('Authorization')).toBe('Bearer token');
    expect(sent.headers.has('x-client-user-id')).toBeFalse(); expect(sent.headers.has('businessnumber')).toBeFalse();
    await firstValueFrom(interceptor.intercept(new HttpRequest('GET', '/other'), next));
    sent = next.handle.calls.mostRecent().args[0];
    expect(sent.headers.get('x-client-user-id')).toBe('client'); expect(sent.headers.get('businessnumber')).toBe('represented-business');
  });
});
