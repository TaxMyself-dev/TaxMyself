import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { PERSONAL_SETTINGS_LINKS, SUBSCRIPTION_SETTINGS_LINKS, activeSettingsSection, SettingsSection } from './settings-navigation';
import { SettingsNewPage } from './settings-new.page';

describe('new settings subscription navigation', () => {
  it('keeps exactly account/business under personal and all other sections under subscription', () => {
    expect(PERSONAL_SETTINGS_LINKS.map(x => x.key)).toEqual(['account', 'businesses', 'agent']);
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


describe('restore settings section', () => {
  it('restores a section instantly without edit state and ignores intermediate scroll events', () => {
    const page: any=Object.create(SettingsNewPage.prototype);
    page.activeSection=signal('account');page.personalEditing=signal(false);page.spouseEditing=signal(false);page.childEditing=signal(null);
    page.activateSection=jasmine.createSpy('activate');page.navigationSession={remember:jasmine.createSpy('remember')};page.navigationContext='visit';
    const scrollTo=jasmine.createSpy('scroll');
    page.scroller={nativeElement:{scrollTop:0,scrollHeight:2000,clientHeight:500,getBoundingClientRect:()=>({top:0}),querySelector:()=>({getBoundingClientRect:()=>({top:700})}),scrollTo}};
    page.goTo('history',true);page.onScroll();
    expect(scrollTo).toHaveBeenCalledWith({behavior:'instant',top:668});
    expect(page.activeSection()).toBe('history');expect(page.personalEditing()).toBeFalse();expect(page.spouseEditing()).toBeFalse();expect(page.childEditing()).toBeNull();
    page.stopRestoringSection();expect(page.scrollTarget).toBeNull();
    page.goTo('payment');expect(page.scrollTarget).toBe('payment');
  });
});

describe('agent section scroll activation', () => {
  it('activates the lazy agent while scrolling between businesses and subscription', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.agentAccess={canAccessAi:()=>true};
    page.activeSection = signal('businesses');
    page.agentActivated = signal(false);
    page.navigationSession = { remember: jasmine.createSpy('remember') };
    const sections = [
      { key: 'businesses', top: -500 },
      { key: 'agent', top: 100 },
      { key: 'subscription', top: 450 },
    ];
    page.scroller = { nativeElement: {
      scrollHeight: 3000, clientHeight: 800, scrollTop: 900,
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => sections.map(s => ({
        dataset: { settingsSection: s.key }, getBoundingClientRect: () => ({ top: s.top }),
      })),
    } };
    page.onScroll();
    expect(page.activeSection()).toBe('agent');
    expect(page.agentActivated()).toBeTrue();
    expect(page.navigationSession.remember).toHaveBeenCalledWith('agent', undefined);
    sections.forEach(s => s.top -= 350);
    page.onScroll();
    expect(page.activeSection()).toBe('subscription');
    expect(page.agentActivated()).toBeTrue();
  });
});

describe('admin-only agent settings',()=>{
 it('hides the personal navigation link and prevents agent activation for regular users',()=>{
  const page:any=Object.create(SettingsNewPage.prototype);page.agentAccess={canAccessAi:()=>false};page.agentActivated=signal(false);
  expect(page.personalLinks.some((link:any)=>link.key==='agent')).toBeFalse();page.activateSection('agent');expect(page.agentActivated()).toBeFalse();
  page.agentAccess={canAccessAi:()=>true};expect(page.personalLinks.some((link:any)=>link.key==='agent')).toBeTrue();page.activateSection('agent');expect(page.agentActivated()).toBeTrue();
 });
});

describe('canonical settings OAuth return section',()=>{
 it('opens permissions after an existing tab=permissions callback instead of restoring another section',()=>{
  const page:any=Object.create(SettingsNewPage.prototype);
  page.selectedTab='permissions';page.agentRoute={queryParamMap:of(convertToParamMap({})),snapshot:{queryParamMap:convertToParamMap({})}};
  page.navigationSession={open:()=>({context:'visit',section:'history'})};page.goTo=jasmine.createSpy();
  const parent=document.createElement('div');parent.appendChild(document.createElement('div'));page.scroller={nativeElement:parent};
  page.ngAfterViewInit();expect(page.goTo).toHaveBeenCalledOnceWith('permissions',true);page.ngOnDestroy();
 });
});
