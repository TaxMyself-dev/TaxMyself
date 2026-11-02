import { TestBed } from '@angular/core/testing';
import { Router, convertToParamMap } from '@angular/router';
import { OpenBankingNavigationService } from 'src/app/services/open-banking-navigation.service';
import { MyAccountPage } from '../../my-account/my-account.page';

describe('Open banking return navigation', () => {
  let service: OpenBankingNavigationService;
  let router: any;
  beforeEach(() => {
    sessionStorage.removeItem('tm.feezbackReturnTo');
    router = { getCurrentNavigation: () => ({ previousNavigation: { finalUrl: '/settings?tab=subscription#details' } }),
      serializeUrl: (url: string) => url, navigateByUrl: jasmine.createSpy().and.resolveTo(true) };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    service = TestBed.inject(OpenBankingNavigationService);
  });
  afterEach(() => service.clear());
  it('restores the full source URL after a provider round trip and clears it', async () => {
    service.begin();
    const afterReload = TestBed.runInInjectionContext(() => new OpenBankingNavigationService());
    await afterReload.returnToOrigin();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/settings?tab=subscription#details', { replaceUrl: true });
    expect(sessionStorage.getItem('tm.feezbackReturnTo')).toBeNull();
  });
  it('preserves the origin across a hosted-card resume', async () => {
    service.begin();
    router.getCurrentNavigation = () => ({ previousNavigation: { finalUrl: '/my-account?cardcom=1' } });
    service.begin(true);
    await service.returnToOrigin();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/settings?tab=subscription#details', { replaceUrl: true });
  });
  for (const url of ['https://example.com', '//example.com', '/billing/open-banking?resumeCard=1', '/\\example.com']) {
    it(`rejects unsafe or looping return URL ${url}`, async () => {
      sessionStorage.setItem('tm.feezbackReturnTo', url);
      await service.returnToOrigin();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/my-account', { replaceUrl: true });
    });
  }
  it('uses the dashboard when opened without a source route', async () => {
    router.getCurrentNavigation = () => null;
    service.begin(); await service.returnToOrigin();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/my-account', { replaceUrl: true });
  });
  it('handles a provider failure callback by returning without a failure popup', () => {
    service.begin();
    const page = Object.create(MyAccountPage.prototype) as any;
    page.route = { snapshot: { queryParamMap: convertToParamMap({ feezbackStatus: 'failure' }) } };
    page.openBankingNavigation = service;
    page.initFeezbackDialogFromReturnUrl();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/settings?tab=subscription#details', { replaceUrl: true });
  });
});