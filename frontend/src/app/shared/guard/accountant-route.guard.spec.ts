import { of } from 'rxjs';
import { AccountantRouteGuard } from './accountant-route.guard';

describe('AccountantRouteGuard', () => {
  const router = { createUrlTree: jasmine.createSpy('createUrlTree') };
  const authService = {
    getRealUserDataFromLocalStorage: jasmine.createSpy('getRealUserDataFromLocalStorage'),
    restoreUserData: jasmine.createSpy('restoreUserData'),
    isLoggedIn: true,
  };
  const startup = { whenReady: jasmine.createSpy('whenReady').and.resolveTo() };
  const guard = new AccountantRouteGuard(authService as any, router as any, startup as any);

  beforeEach(() => {
    router.createUrlTree.calls.reset();
    authService.getRealUserDataFromLocalStorage.calls.reset();
    authService.restoreUserData.calls.reset();
    startup.whenReady.calls.reset();
  });

  it('allows accountant and administrator roles', async () => {
    authService.getRealUserDataFromLocalStorage.and.returnValue({ role: ['ACCOUNTANT'] });
    expect(await guard.canActivate()).toBeTrue();

    authService.getRealUserDataFromLocalStorage.and.returnValue({ role: ['ADMIN'] });
    expect(await guard.canActivate()).toBeTrue();
  });

  it('redirects a regular user to their dashboard', async () => {
    const redirect = { redirected: true };
    authService.getRealUserDataFromLocalStorage.and.returnValue({ role: ['REGULAR'] });
    router.createUrlTree.and.returnValue(redirect);

    expect(await guard.canActivate()).toBe(redirect as any);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/my-account']);
  });

  it('restores the real profile on cold boot before deciding', async () => {
    authService.getRealUserDataFromLocalStorage.and.returnValue(null);
    authService.restoreUserData.and.returnValue(of({ role: ['ACCOUNTANT'] }));

    expect(await guard.canActivate()).toBeTrue();
    expect(authService.restoreUserData).toHaveBeenCalled();
  });
});
