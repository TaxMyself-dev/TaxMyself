import { AuthGuard } from './auth.guard';
import { environment } from '../../../environments/environment';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { StartupService } from '../../services/startup.service';
import { MfaService } from '../../services/mfa.service';
import { NetworkStatusService } from '../../services/pwa/network-status.service';
import { OfflineNavigationGuard } from './offline-navigation.guard';

describe('AuthGuard MFA enforcement', () => {
  const originalRequireMfa = environment.requireMfa;
  let createdUrl: string | undefined;
  let authService: any;
  let mfa: any;
  let guard: AuthGuard;

  beforeEach(() => {
    environment.requireMfa = true;
    createdUrl = undefined;
    authService = {
      isLoggedIn: true,
      getUserDataFromLocalStorage: () => ({ firebaseId: 'owner-uid' }),
    };
    mfa = { sessionState: () => Promise.resolve('VERIFIED') };
    guard = new AuthGuard(
      authService,
      {
        createUrlTree: ([url]: string[]) => {
          createdUrl = url;
          return url;
        },
      } as any,
      { whenReady: () => Promise.resolve() } as any,
      mfa,
    );
  });

  afterAll(() => {
    environment.requireMfa = originalRequireMfa;
  });

  it('routes an unenrolled authenticated user to MFA setup', async () => {
    mfa.sessionState = () => Promise.resolve('NOT_ENROLLED');

    const result = await guard.canActivate({} as any, {} as any);

    expect(result as any).toBe('/mfa/setup');
    expect(createdUrl).toBe('/mfa/setup');
  });

  it('routes a session without second-factor proof to login', async () => {
    mfa.sessionState = () => Promise.resolve('VERIFICATION_REQUIRED');

    const result = await guard.canActivate({} as any, {} as any);

    expect(result as any).toBe('/login');
    expect(createdUrl).toBe('/login');
  });

  it('allows a verified MFA session with a cached profile', async () => {
    const result = await guard.canActivate({} as any, {} as any);

    expect(result).toBeTrue();
    expect(createdUrl).toBeUndefined();
  });
});

@Component({ standalone: true, template: '' })
class GuardNavigationTestPage {}

describe('AuthGuard protected-shell router navigation', () => {
  const originalRequireMfa = environment.requireMfa;
  let auth: any;
  let mfa: any;
  let network: any;

  beforeEach(() => {
    environment.requireMfa = true;
    auth = {
      isLoggedIn: true,
      getUserDataFromLocalStorage: jasmine.createSpy().and.returnValue({ firebaseId: 'owner' }),
      restoreUserData: jasmine.createSpy().and.returnValue(of({ firebaseId: 'owner' })),
    };
    mfa = { sessionState: jasmine.createSpy().and.resolveTo('VERIFIED') };
    network = { isBrowserOnline: jasmine.createSpy().and.returnValue(true), notifyOfflineNavigationBlocked: jasmine.createSpy() };
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        { path: 'login', component: GuardNavigationTestPage },
        { path: 'mfa/setup', component: GuardNavigationTestPage },
        { path: '', canActivateChild: [OfflineNavigationGuard, AuthGuard], children: [
          { path: 'guard-protected', component: GuardNavigationTestPage },
        ] },
      ]),
      { provide: AuthService, useValue: auth },
      { provide: StartupService, useValue: { whenReady: () => Promise.resolve() } },
      { provide: MfaService, useValue: mfa },
      { provide: NetworkStatusService, useValue: network },
    ] });
  });

  afterEach(() => { environment.requireMfa = originalRequireMfa; });

  async function navigate(): Promise<string> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/guard-protected');
    return TestBed.inject(Router).url;
  }

  it('enters the protected child after login without treating a guard instance as a function', async () => {
    expect(await navigate()).toBe('/guard-protected');
    expect(mfa.sessionState).toHaveBeenCalled();
  });

  it('redirects signed-out users to login', async () => {
    auth.isLoggedIn = false;
    expect(await navigate()).toBe('/login');
    expect(mfa.sessionState).not.toHaveBeenCalled();
  });

  it('keeps the MFA enrollment requirement on protected children', async () => {
    mfa.sessionState.and.resolveTo('NOT_ENROLLED');
    expect(await navigate()).toBe('/mfa/setup');
  });

  it('keeps sessions awaiting MFA verification outside protected children', async () => {
    mfa.sessionState.and.resolveTo('VERIFICATION_REQUIRED');
    expect(await navigate()).toBe('/login');
  });

  it('restores a missing cached profile before activating a child', async () => {
    auth.getUserDataFromLocalStorage.and.returnValue(null);
    expect(await navigate()).toBe('/guard-protected');
    expect(auth.restoreUserData).toHaveBeenCalled();
  });

  it('keeps the current page when the offline shell guard denies navigation', async () => {
    const harness = await RouterTestingHarness.create('/login');
    network.isBrowserOnline.and.returnValue(false);
    await harness.navigateByUrl('/guard-protected');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(network.notifyOfflineNavigationBlocked).toHaveBeenCalled();
  });
});
