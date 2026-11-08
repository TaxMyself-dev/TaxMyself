import { of } from 'rxjs';
import {
  SHAAM_OAUTH_ORIGIN_STORAGE_KEY,
} from 'src/app/services/shaam.service';
import { ShaamCallbackPage } from './shaam-callback.page';

describe('ShaamCallbackPage origin routing', () => {
  function setup(storedOrigin?: string) {
    sessionStorage.clear();
    localStorage.clear();
    if (storedOrigin) {
      sessionStorage.setItem(SHAAM_OAUTH_ORIGIN_STORAGE_KEY, storedOrigin);
    }

    const page = Object.create(ShaamCallbackPage.prototype) as ShaamCallbackPage;
    Object.assign(page, {
      route: { queryParams: of({ connected: 'true' }) },
      router: { navigate: jasmine.createSpy('navigate') },
      accessHandlerService: { handleFeatureAccess: jasmine.createSpy() },
      messageService: { add: jasmine.createSpy('add') },
      isLoading: true,
      isSuccess: false,
      isError: false,
      errorMessage: '',
      connectionOrigin: 'document',
    });
    return page;
  }

  it('returns a settings-originated connection to permissions without a free-form redirect', () => {
    const page = setup('settings');

    page.ngOnInit();

    expect(page.isSuccess).toBeTrue();
    expect(page.isSettingsOrigin).toBeTrue();
    expect(sessionStorage.getItem(SHAAM_OAUTH_ORIGIN_STORAGE_KEY)).toBeNull();

    page.navigateToSettings();
    expect((page as any).router.navigate).toHaveBeenCalledWith(
      ['/settings'],
      { queryParams: { tab: 'permissions' } },
    );
  });

  it('treats an unknown or absent origin as the legacy document flow', () => {
    const page = setup('https://attacker.example/redirect');

    page.ngOnInit();

    expect(page.isSettingsOrigin).toBeFalse();
    expect(page.connectionOrigin).toBe('document');
    expect(sessionStorage.getItem(SHAAM_OAUTH_ORIGIN_STORAGE_KEY)).toBeNull();
  });

  it('returns a uniform-file authorization to the uniform-file page', () => {
    const page = setup('uniform-file');

    page.ngOnInit();

    expect(page.isUniformFileOrigin).toBeTrue();
    page.navigateToUniformFile();
    expect((page as any).router.navigate).toHaveBeenCalledWith([
      '/uniform-file',
    ]);
  });
});
