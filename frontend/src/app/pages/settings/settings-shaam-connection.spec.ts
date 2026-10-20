import { signal } from '@angular/core';
import { throwError } from 'rxjs';
import { SettingsPage } from './settings.page';
import { SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED } from 'src/app/services/shaam.service';

describe('settings SHAAM connection management', () => {
  function setup(status: 'connected' | 'disconnected' = 'connected') {
    const page = Object.create(SettingsPage.prototype) as SettingsPage;
    page.shaamConnectionStatuses = signal({ '515000000': status });
    page.connectingShaamBusinessNumber = signal<string | null>(null);
    page.confirmationService = { confirm: jasmine.createSpy('confirm') } as any;
    page.messageService = { add: jasmine.createSpy('add') } as any;
    (page as any).shaamService = { initiateOAuthFlow: jasmine.createSpy('initiateOAuthFlow') };
    return page;
  }

  it('requires confirmation before replacing an active connection', () => {
    const page = setup('connected');

    page.connectShaam('515000000');

    expect((page as any).shaamService.initiateOAuthFlow).not.toHaveBeenCalled();
    const dialog = (page.confirmationService.confirm as jasmine.Spy).calls.mostRecent().args[0];
    expect(dialog.message).toContain('יחליף את ההרשאה');
    expect(dialog.rejectVisible).toBeTrue();

    dialog.accept();
    expect((page as any).shaamService.initiateOAuthFlow).toHaveBeenCalledWith(
      '515000000',
      jasmine.any(Function),
    );
  });

  it('starts initial connection immediately for a disconnected business', () => {
    const page = setup('disconnected');

    page.connectShaam('515000000');

    expect(page.confirmationService.confirm).not.toHaveBeenCalled();
    expect((page as any).shaamService.initiateOAuthFlow).toHaveBeenCalledWith(
      '515000000',
      jasmine.any(Function),
    );
  });

  it('maps the expected sandbox restriction to a dedicated disabled state', () => {
    const page = setup('disconnected');
    page.businesses = signal<any[]>([{ businessNumber: '304902133' }]);
    (page as any).shaamService.getConnectionStatus = jasmine
      .createSpy('getConnectionStatus')
      .and.returnValue(throwError(() => ({
        error: { code: SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED },
      })));

    (page as any).loadShaamConnectionStatuses();

    expect(page.shaamConnectionStatus('304902133')).toBe('sandbox-blocked');
    page.connectShaam('304902133');
    expect((page as any).shaamService.initiateOAuthFlow).not.toHaveBeenCalled();
    expect(page.confirmationService.confirm).not.toHaveBeenCalled();
  });

  it('keeps unexpected status failures distinct from the sandbox limitation', () => {
    const page = setup('disconnected');
    page.businesses = signal<any[]>([{ businessNumber: '304902133' }]);
    (page as any).shaamService.getConnectionStatus = jasmine
      .createSpy('getConnectionStatus')
      .and.returnValue(throwError(() => ({ status: 500 })));

    (page as any).loadShaamConnectionStatuses();

    expect(page.shaamConnectionStatus('304902133')).toBe('error');
  });
});
