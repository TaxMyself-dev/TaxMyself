import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ClientPanelService } from '../../services/clients-panel.service';
import { SettingsNavigationSessionService } from './settings-navigation-session.service';

describe('temporary settings navigation session', () => {
  const user = signal<any>({uid:'owner-a'});
  let client: BehaviorSubject<string | null>;
  let service: SettingsNavigationSessionService;
  beforeEach(() => {
    user.set({uid:'owner-a'});client=new BehaviorSubject<string | null>(null);
    TestBed.configureTestingModule({providers:[
      {provide:AuthService,useValue:{currentUser:user}},
      {provide:ClientPanelService,useValue:{selectedClientId$:client.asObservable()}},
    ]});
    service=TestBed.inject(SettingsNavigationSessionService);TestBed.flushEffects();
  });
  it('remembers only a section across page visits and keeps it on same-user profile refresh', () => {
    const first=service.open();expect(first.section).toBe('account');
    service.remember('categories',first.context);
    expect(service.open().section).toBe('categories');
    user.set({uid:'owner-a',displayName:'refreshed'});TestBed.flushEffects();
    expect(service.open().section).toBe('categories');
  });
  it('resets after logout and a fresh login with the same account, even outside settings', () => {
    const visit=service.open();service.remember('banking',visit.context);
    user.set(null);TestBed.flushEffects();
    expect(service.open().section).toBe('account');
    user.set({uid:'owner-a'});TestBed.flushEffects();
    service.remember('banking',visit.context);
    expect(service.open().section).toBe('account');
  });
  it('resets on account replacement and rejects trailing old-page scroll events', () => {
    const visit=service.open();service.remember('payment',visit.context);
    user.set({uid:'owner-b'});service.remember('history',visit.context);
    expect(service.open().section).toBe('account');
    user.set({uid:'owner-a'});TestBed.flushEffects();
    expect(service.open().section).toBe('account');
  });
  it('resets on delegated-client changes, including leaving and returning before another page visit', () => {
    const owner=service.open();service.remember('permissions',owner.context);
    client.next('client-a');const delegated=service.open();expect(delegated.section).toBe('account');
    service.remember('history',delegated.context);
    client.next('client-b');client.next('client-a');
    service.remember('history',delegated.context);expect(service.open().section).toBe('account');
    client.next(null);service.remember('permissions',owner.context);expect(service.open().section).toBe('account');
  });
  it('starts fresh in a new app instance and does not touch browser storage', () => {
    const local=spyOn(localStorage,'setItem'),session=spyOn(sessionStorage,'setItem');
    const visit=service.open();service.remember('categories',visit.context);
    const fresh=TestBed.runInInjectionContext(()=>new SettingsNavigationSessionService());
    expect(fresh.open().section).toBe('account');
    expect(local).not.toHaveBeenCalled();expect(session).not.toHaveBeenCalled();
  });
});
