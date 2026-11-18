import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { PERSONAL_SETTINGS_LINKS, SUBSCRIPTION_SETTINGS_LINKS, activeSettingsSection, SettingsSection } from './settings-navigation';
import { SettingsNewPage } from './settings-new.page';

describe('new settings subscription navigation', () => {
  it('keeps exactly account/business under personal and all other sections under subscription', () => {
    expect(PERSONAL_SETTINGS_LINKS.map(x => x.key)).toEqual(['account', 'businesses']);
    expect(SUBSCRIPTION_SETTINGS_LINKS.map(x => x.key)).toEqual(['subscription', 'payment', 'history', 'categories', 'permissions', 'banking']);
  });
  it('tracks each section and selects a short final section at scroll end', () => {
    const keys: SettingsSection[] = ['account', 'businesses', 'subscription', 'payment', 'history', 'permissions', 'banking'];
    const positions = keys.map((key, i) => ({ key, top: i * 700 }));
    keys.forEach((key, i) => expect(activeSettingsSection(positions.map(x => ({ ...x, top: x.top - i * 700 })), 0, false)).toBe(key));
    expect(activeSettingsSection(positions, 0, true)).toBe('banking');
    expect(activeSettingsSection([], 0, false)).toBe('account');
  });
  it('loads connections only when reached, once, and activates stored banking management independently', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.connectionsActivated = signal(false);
    page.bankingActivated = signal(false);
    page.onTabChange = jasmine.createSpy('existing connection loader');
    page.activateSection('account');
    page.activateSection('subscription');
    page.activateSection('history');
    expect(page.onTabChange).not.toHaveBeenCalled();
    page.activateSection('permissions');
    page.activateSection('permissions');
    expect(page.onTabChange).toHaveBeenCalledOnceWith('permissions');
    expect(page.bankingActivated()).toBeFalse();
    page.activateSection('banking');
    expect(page.bankingActivated()).toBeTrue();
    expect(page.onTabChange).toHaveBeenCalledTimes(1);
  });
  it('does not grant a permission on invalid input or duplicate pending submission', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.addingPermission = signal(false);
    page.addPermissionFormGroup = new FormGroup({ email: new FormControl('invalid', [Validators.required, Validators.email]) });
    page.submitAddPermission = jasmine.createSpy('grant');
    page.submitNewPermission();
    expect(page.submitAddPermission).not.toHaveBeenCalled();
    page.addPermissionFormGroup.get('email').setValue('valid@example.com');
    page.addingPermission.set(true);
    page.submitNewPermission();
    expect(page.submitAddPermission).not.toHaveBeenCalled();
    page.addingPermission.set(false);
    page.submitNewPermission();
    expect(page.submitAddPermission).toHaveBeenCalledTimes(1);
    expect(page.addPermissionEmail).toBe('valid@example.com');
  });
});


describe('new settings logout confirmation', () => {
  it('logs out only after explicit acceptance; cancel and dismiss keep the session', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    const confirm = jasmine.createSpy('confirm');
    page.confirmationService = { confirm };
    page.authService = { logout: jasmine.createSpy('logout') };
    page.confirmLogout();
    const options = confirm.calls.mostRecent().args[0];
    expect(options.key).toBe('settings-new-logout');
    expect(options.defaultFocus).toBe('reject');
    expect(page.authService.logout).not.toHaveBeenCalled();
    options.reject?.();
    expect(page.authService.logout).not.toHaveBeenCalled();
    options.accept();
    expect(page.authService.logout).toHaveBeenCalledTimes(1);
  });
});
