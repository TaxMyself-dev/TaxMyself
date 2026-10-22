import { TestBed } from '@angular/core/testing';
import { GenericService } from 'src/app/services/generic.service';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { OpenBankingManagementComponent } from './open-banking-management.component';

describe('open banking disconnection', () => {
  const consent = { consentId: 'shared', connectionRole: 'spouse' as const, status: 'valid', sources: [
    { sourceRecordId: 1, sourceName: '12345', sourceType: 'BANK_ACCOUNT' as const },
    { sourceRecordId: 2, sourceName: '6789', sourceType: 'CREDIT_CARD' as const },
  ] };
  let service: any; let auth: any; let router: any; let component: OpenBankingManagementComponent;
  beforeEach(() => {
    service = { disconnectionTargets: jasmine.createSpy().and.returnValue(of({ consents: [consent], complete: true, hasOpenBanking: true, errors: [] })),
      disconnect: jasmine.createSpy().and.returnValue(of({ status: 'success', remainingConsents: [], complete: true, hasOpenBanking: false, errors: [], results: [] })) };
    auth = { isViewingAsClient: jasmine.createSpy().and.returnValue(false), restoreUserData: jasmine.createSpy().and.returnValue(of(null)) };
    router = { navigate: jasmine.createSpy() };
    TestBed.configureTestingModule({ imports: [OpenBankingManagementComponent], providers: [ provideNoopAnimations(), { provide: GenericService, useValue: { isMobile: () => false } }, { provide: FeezbackService, useValue: service }, { provide: AuthService, useValue: auth }, { provide: Router, useValue: router } ] });
    component = TestBed.runInInjectionContext(() => new OpenBankingManagementComponent());
  });
  it('renders bank and card labels for actual stored source types', () => {
    const fixture = TestBed.createComponent(OpenBankingManagementComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('חשבון בנק'); expect(text).toContain('12345');
    expect(text).toContain('כרטיס'); expect(text).toContain('6789');
    expect(text).toContain('בתוקף'); fixture.destroy();
  });
  it('explains a synthetic demo connection without exposing mutation targets', () => {
    service.disconnectionTargets.and.returnValue(throwError(() => ({ error: { code: 'SYNTHETIC_OPEN_BANKING' } })));
    component.load();
    expect(component.error()).toContain('חיבור הדגמה'); expect(component.targets()).toBeNull();
    component.reconnect(); expect(router.navigate).not.toHaveBeenCalled();
    expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('does not start a second discovery or mutate before discovery completes', () => {
    service.disconnectionTargets.and.returnValue(new Subject());
    component.load(); component.load(); component.confirmation.set('all'); component.confirm();
    expect(service.disconnectionTargets).toHaveBeenCalledTimes(1);
    expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('previews all sources sharing the chosen consent and sends its identity', () => {
    component.ngOnInit(); component.confirmation.set(consent);
    expect(component.affectedConsents()[0].sources.length).toBe(2);
    expect(service.disconnect).not.toHaveBeenCalled();
    component.confirm();
    expect(service.disconnect).toHaveBeenCalledWith({ firebaseId: undefined, scope: 'consent', consentId: 'shared', connectionRole: 'spouse' });
    expect(auth.restoreUserData).toHaveBeenCalled();
  });
  it('sends full admin disconnect without narrowing to a single identity', () => {
    component.firebaseId = 'client'; component.ngOnInit(); component.confirmation.set('all'); component.confirm();
    expect(service.disconnect).toHaveBeenCalledWith({ firebaseId: 'client', scope: 'all' });
    expect(auth.restoreUserData).not.toHaveBeenCalled();
  });
  it('never declares success for partial or unverified termination and retains retry targets', () => {
    service.disconnect.and.returnValue(of({ status: 'partial', remainingConsents: [consent], complete: false, hasOpenBanking: true, errors: [], results: [] }));
    component.ngOnInit(); component.confirmation.set('all'); component.confirm();
    expect(component.error()).toContain('לא הושלמה'); expect(component.message()).toBe('');
    expect(component.targets()?.consents).toEqual([consent]); expect(component.busy()).toBeFalse();
  });
  it('requires refreshing after transport failure instead of assuming disconnection', () => {
    service.disconnect.and.returnValue(throwError(() => new Error('timeout')));
    component.ngOnInit(); component.confirmation.set('all'); component.confirm();
    expect(component.targets()).toBeNull(); expect(component.error()).toContain('לרענן');
    component.load(); expect(component.targets()?.complete).toBeTrue();
  });
  it('blocks owner controls in represented client mode', () => {
    auth.isViewingAsClient.and.returnValue(true);
    component.ngOnInit(); component.confirmation.set('all'); component.confirm(); component.reconnect();
    expect(service.disconnectionTargets).not.toHaveBeenCalled(); expect(service.disconnect).not.toHaveBeenCalled(); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('blocks duplicate mutations while waiting and uses existing enrollment for reconnect', () => {
    service.disconnect.and.returnValue(new Subject());
    component.ngOnInit(); component.confirmation.set('all'); component.confirm(); component.confirm();
    expect(service.disconnect).toHaveBeenCalledTimes(1);
    component.reconnect(); expect(router.navigate).not.toHaveBeenCalled();
    component.busy.set(false); component.reconnect(); expect(router.navigate).toHaveBeenCalledWith(['/billing/open-banking']);
  });
  it('refreshes a row preview and includes every instrument without mutation', () => {
    component.openSourceConsent(1);
    expect(service.disconnectionTargets).toHaveBeenCalledTimes(1);
    expect(component.affectedConsents()[0].sources.map(source => source.sourceName)).toEqual(['12345', '6789']);
    expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('requires a choice when a stored source belongs to multiple consents', () => {
    const second = { ...consent, consentId: 'other' };
    service.disconnectionTargets.and.returnValue(of({ consents: [consent, second], complete: true, hasOpenBanking: true, errors: [] }));
    component.openSourceConsent(1);
    expect(component.confirmation()).toBeNull(); expect(component.choices()?.length).toBe(2);
    component.selectConsent(second); component.confirm();
    expect(service.disconnect).toHaveBeenCalledWith({ firebaseId: undefined, scope: 'consent', consentId: 'other', connectionRole: 'spouse' });
  });
  it('blocks incomplete previews and explains the affected identity and operation', () => {
    service.disconnectionTargets.and.returnValue(of({ consents: [consent], complete: false, hasOpenBanking: true,
      errors: [{ connectionRole: 'spouse', code: 'cards_failed', operation: 'cards', stage: 'provider' }] }));
    component.openFullDisconnect(); component.confirm();
    expect(service.disconnect).not.toHaveBeenCalled();
    expect(component.diagnosticMessages().join(' ')).toContain('בן/בת הזוג');
    expect(component.diagnosticMessages().join(' ')).toContain('הכרטיסים');
  });
  it('does not reuse a stale source and requests a table refresh', () => {
    spyOn(component.connectionChanged, 'emit'); component.openSourceConsent(99);
    expect(component.confirmation()).toBeNull(); expect(component.error()).toContain('לא נמצאה');
    expect(component.connectionChanged.emit).toHaveBeenCalled(); expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('blocks all commands while another table action is running', () => {
    component.ngOnInit(); component.confirmation.set('all'); component.externalBusy = true;
    service.disconnectionTargets.calls.reset();
    component.openSourceConsent(1); component.openFullDisconnect(); component.reconnect(); component.confirm();
    expect(service.disconnectionTargets).not.toHaveBeenCalled(); expect(service.disconnect).not.toHaveBeenCalled(); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('lists provider-only instruments without requiring a stored source id', () => {
    service.disconnectionTargets.and.returnValue(of({ consents: [{ ...consent, sources: [...consent.sources,
      { sourceRecordId: null, resourceId: 'provider-card', sourceName: '4321', sourceType: 'CREDIT_CARD' }] }], complete: true, hasOpenBanking: true, errors: [] }));
    component.openSourceConsent(1);
    expect(component.affectedConsents()[0].sources.length).toBe(3); expect(component.rows().length).toBe(3);
    expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('renders only the footer and popup when embedded in the existing source table', () => {
    const fixture = TestBed.createComponent(OpenBankingManagementComponent);
    fixture.componentInstance.embedded = true; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-generic-table')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('התנתקות מלאה מבנקאות פתוחה');
    fixture.componentInstance.openSourceConsent(1); fixture.detectChanges();
    expect(document.body.textContent).toContain('12345'); expect(document.body.textContent).toContain('6789');
    fixture.destroy();
  });
  it('starts the deferred initial check after the parent source table finishes loading', () => {
    component.externalBusy = true; component.ngOnInit();
    expect(service.disconnectionTargets).not.toHaveBeenCalled();
    component.externalBusy = false;
    component.ngOnChanges({ externalBusy: { previousValue: true, currentValue: false, firstChange: false, isFirstChange: () => false } });
    expect(service.disconnectionTargets).toHaveBeenCalledTimes(1);
  });
  it('retains a selectable row for a pending consent without identified instruments', () => {
    service.disconnectionTargets.and.returnValue(of({ consents: [{ ...consent, status: 'received', sources: [] }], complete: true, hasOpenBanking: false, errors: [] }));
    component.ngOnInit(); expect(component.rows().length).toBe(1);
    component.openConsentKey('spouse:shared');
    expect(component.confirmation()).toEqual(jasmine.objectContaining({ consentId: 'shared' }));
    expect(service.disconnect).not.toHaveBeenCalled();
  });
});
