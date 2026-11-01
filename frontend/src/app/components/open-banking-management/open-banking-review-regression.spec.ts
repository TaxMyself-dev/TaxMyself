import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MyAccountPage } from 'src/app/pages/my-account/my-account.page';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { GenericService } from 'src/app/services/generic.service';
import { OpenBankingManagementComponent } from './open-banking-management.component';

describe('Banking cancellation preview regressions',()=>{
  function setup() {
    const account={sourceRecordId:1,sourceName:'1111',sourceType:'BANK_ACCOUNT'};
    const addedCard={sourceRecordId:2,sourceName:'2222',sourceType:'CREDIT_CARD'};
    const consent={consentId:'shared',connectionRole:'primary',status:'valid',sources:[account]};
    const saved={consents:[consent],complete:true,hasOpenBanking:true,errors:[]};
    const live={...saved,consents:[{...consent,sources:[account,addedCard]}]};
    const service={disconnectionTargets:jasmine.createSpy().and.returnValue(of(saved)),
      refreshPermissions:jasmine.createSpy().and.returnValue(of(live)),disconnect:jasmine.createSpy()};
    TestBed.configureTestingModule({imports:[OpenBankingManagementComponent],providers:[provideNoopAnimations(),
      {provide:GenericService,useValue:{isMobile:()=>false}},{provide:FeezbackService,useValue:service},
      {provide:AuthService,useValue:{isViewingAsClient:()=>false,restoreUserData:()=>of({hasOpenBanking:true})}},
      {provide:Router,useValue:{navigate:jasmine.createSpy()}}]});
    const component=TestBed.runInInjectionContext(()=>new OpenBankingManagementComponent());
    component.ngOnInit();
    return {component,service,saved,live};
  }
  it('shows newly covered instruments before permitting cancellation',()=>{
    const {component,service}=setup();
    expect(service.refreshPermissions).not.toHaveBeenCalled();
    component.openSourceConsent(1);
    expect(service.refreshPermissions).toHaveBeenCalled();
    expect(component.affectedConsents()[0]?.sources.length).toBe(2);
    expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('does not offer full-disconnection confirmation after an incomplete refresh',()=>{
    const {component,service,live}=setup();
    service.refreshPermissions.and.returnValue(of({...live,complete:false}));
    component.openFullDisconnect(); component.confirm();
    expect(service.refreshPermissions).toHaveBeenCalledTimes(1);
    expect(component.confirmation()).toBeNull();
    expect(component.canConfirm()).toBeFalse();
    expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('retains saved rows but blocks confirmation when verification fails',()=>{
    const {component,service,saved}=setup();
    const issue={code:'OB-01',errorId:'12345678-1234-1234-1234-123456789012',message:'לא הצלחנו לבדוק הרשאות'};
    service.refreshPermissions.and.returnValue(throwError(()=>({error:{supportError:issue}})));
    component.openFullDisconnect(); component.confirm();
    expect(component.targets()?.consents).toEqual(saved.consents as any);
    expect(component.supportError()).toEqual(issue);
    expect(component.confirmation()).toBeNull();
    expect(service.disconnect).not.toHaveBeenCalled();
  });
  it('keeps keyed consent cancellation blocked until verification completes',()=>{
    const {component,service,live}=setup();
    const pending=new Subject<any>(); service.refreshPermissions.and.returnValue(pending);
    component.openConsentKey('primary:shared'); component.confirm();
    expect(component.canConfirm()).toBeFalse();
    expect(service.disconnect).not.toHaveBeenCalled();
    pending.next(live); pending.complete();
    expect(component.affectedConsents()[0]?.sources.length).toBe(2);
    expect(component.canConfirm()).toBeTrue();
  });
});

describe('Banking terminal dialog regression',()=>{
  it('does not claim full success when source reads succeeded but persistence failed',()=>{
    const page=Object.create(MyAccountPage.prototype) as any;
    const issue={code:'OB-04',errorId:'12345678-1234-1234-1234-123456789012',partial:true,message:'חלק מהתנועות לא נשמרו'};
    Object.assign(page,{bankingError:signal(issue),syncSourceResults:signal([{status:'success'},{status:'skipped_direct'}]),
      feezbackDialogStatus:signal('loading'),feezbackDialogTitle:signal(''),feezbackDialogIcon:signal('')});
    page.applyTerminalDialogState();
    expect(page.feezbackDialogStatus()).toBe('failure');
    expect(page.feezbackDialogTitle()).toBe(issue.message);
    expect(page.feezbackDialogIcon()).toBe('warning');
  });
});
