import { AdminRouteGuard } from './admin-route.guard';
import { of } from 'rxjs';

describe('AdminRouteGuard', () => {
  const router = { createUrlTree: jasmine.createSpy('createUrlTree') };
  const authService = {
    getRealUserDataFromLocalStorage: jasmine.createSpy('getRealUserDataFromLocalStorage'),
    restoreUserData: jasmine.createSpy('restoreUserData'),
    isLoggedIn: true,
  };
  const startup = { whenReady: jasmine.createSpy('whenReady').and.resolveTo() };
  const guard = new AdminRouteGuard(authService as any, router as any, startup as any);

  beforeEach(() => {
    router.createUrlTree.calls.reset();
    authService.getRealUserDataFromLocalStorage.calls.reset();
    authService.restoreUserData.calls.reset();
    startup.whenReady.calls.reset();
  });

  it('allows a verified cached admin profile', async () => {
    authService.getRealUserDataFromLocalStorage.and.returnValue({ role: 'ADMIN' });

    expect(await guard.canActivate()).toBeTrue();
  });

  it('redirects a regular user away from the admin console', async () => {
    const redirect = { redirected: true };
    authService.getRealUserDataFromLocalStorage.and.returnValue({ role: 'USER' });
    router.createUrlTree.and.returnValue(redirect);

    expect(await guard.canActivate()).toBe(redirect as any);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/my-account']);
  });

  it('restores the signed-in profile before deciding on a cold boot', async () => {
    authService.getRealUserDataFromLocalStorage.and.returnValue(null);
    authService.restoreUserData.and.returnValue(of({ role: 'ADMIN' }));

    expect(await guard.canActivate()).toBeTrue();
    expect(authService.restoreUserData).toHaveBeenCalled();
  });
});
