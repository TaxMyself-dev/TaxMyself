import { TestBed } from '@angular/core/testing';
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
    TestBed.configureTestingModule({ imports: [OpenBankingManagementComponent], providers: [ provideNoopAnimations(), { provide: FeezbackService, useValue: service }, { provide: AuthService, useValue: auth }, { provide: Router, useValue: router } ] });
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
    component.firebaseId = 'client'; component.confirmation.set('all'); component.confirm();
    expect(service.disconnect).toHaveBeenCalledWith({ firebaseId: 'client', scope: 'all' });
    expect(auth.restoreUserData).not.toHaveBeenCalled();
  });
  it('never declares success for partial or unverified termination and retains retry targets', () => {
    service.disconnect.and.returnValue(of({ status: 'partial', remainingConsents: [consent], complete: false, hasOpenBanking: true, errors: [], results: [] }));
    component.confirmation.set('all'); component.confirm();
    expect(component.error()).toContain('לא הושלמה'); expect(component.message()).toBe('');
    expect(component.targets()?.consents).toEqual([consent]); expect(component.busy()).toBeFalse();
  });
  it('requires refreshing after transport failure instead of assuming disconnection', () => {
    service.disconnect.and.returnValue(throwError(() => new Error('timeout')));
    component.confirmation.set('all'); component.confirm();
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
    component.confirmation.set('all'); component.confirm(); component.confirm();
    expect(service.disconnect).toHaveBeenCalledTimes(1);
    component.reconnect(); expect(router.navigate).not.toHaveBeenCalled();
    component.busy.set(false); component.reconnect(); expect(router.navigate).toHaveBeenCalledWith(['/billing/open-banking']);
  });
});
