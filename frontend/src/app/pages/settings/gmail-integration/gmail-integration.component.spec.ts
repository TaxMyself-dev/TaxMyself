import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { GmailSyncStateService } from 'src/app/services/gmail-sync-state.service';
import { IntegrationsService } from 'src/app/services/integrations.service';
import { GmailIntegrationComponent } from './gmail-integration.component';

describe('Gmail connection controls', () => {
  let component: GmailIntegrationComponent;
  let connect: jasmine.Spy;
  let refresh: jasmine.Spy;
  let viewingAsClient: boolean;
  beforeEach(() => {
    viewingAsClient = false;
    connect = jasmine.createSpy().and.returnValue(EMPTY);
    refresh = jasmine.createSpy();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { isViewingAsClient: () => viewingAsClient } },
      { provide: IntegrationsService, useValue: { getGoogleConnectUrl: connect, disconnectGoogleIntegration: () => throwError(() => new Error('remote failure')) } },
      { provide: GmailSyncStateService, useValue: { refresh, accounts: signal([]), status: signal(null) } },
      { provide: GenericService, useValue: { isMobile: signal(false) } },
      { provide: MessageService, useValue: { add: jasmine.createSpy() } },
      { provide: ConfirmationService, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new GmailIntegrationComponent());
  });
  it('passes the selected row when reconnecting', () => {
    component.connectGmail(42);
    expect(connect).toHaveBeenCalledOnceWith(42);
  });
  it('does not create connections in represented-client mode', () => {
    viewingAsClient = true;
    component.connectGmail();
    expect(connect).not.toHaveBeenCalled();
  });
  it('does not load mailbox status in represented-client mode', () => {
    viewingAsClient = true;
    component.ngOnInit();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reloads server state after a failed remote disconnect so the pending retry is visible', () => {
    (component as any).disconnectGmail(42);
    expect(refresh).toHaveBeenCalled();
    expect(component.isDisconnecting(42)).toBeFalse();
  });
});

describe('Mailbox routing settings',()=>{
  let component:GmailIntegrationComponent;
  let get:jasmine.Spy,save:jasmine.Spy;
  let represented=false;
  beforeEach(()=>{
    represented=false;
    get=jasmine.createSpy().and.returnValue(of({settings:{businessNumber:'123456789',rules:[]},businesses:[{businessNumber:'123456789',businessName:'עסק א'}]}));
    save=jasmine.createSpy().and.returnValue(EMPTY);
    TestBed.configureTestingModule({providers:[
      {provide:AuthService,useValue:{isViewingAsClient:()=>represented}},
      {provide:IntegrationsService,useValue:{getEmailRouting:get,saveEmailRouting:save}},
      {provide:GmailSyncStateService,useValue:{refresh:()=>{},accounts:signal([]),status:signal(null)}},
      {provide:GenericService,useValue:{isMobile:signal(false)}},
      {provide:MessageService,useValue:{add:()=>{}}},{provide:ConfirmationService,useValue:{}},
    ]});
    component=TestBed.runInInjectionContext(()=>new GmailIntegrationComponent());
  });
  it('supports adding/removing several rules and saves the clicked mailbox only',()=>{
    component.openRouting(17);component.addRoutingRule();component.addRoutingRule();
    component.routingConfig()!.settings.rules[0]={sender:'a@example.com',action:'BLOCK'};
    component.routingConfig()!.settings.rules[1]={sender:'b@example.com',action:'BUSINESS',businessNumber:'123456789'};
    component.removeRoutingRule(0);component.saveRouting();component.saveRouting();
    expect(save).toHaveBeenCalledOnceWith(17,{businessNumber:'123456789',rules:[{sender:'b@example.com',action:'BUSINESS',businessNumber:'123456789'}]});
  });
  it('retains editable rules after a rejected save and permits retry',()=>{
    save.and.returnValue(throwError(()=>new Error('invalid rules')));
    component.openRouting(17);component.addRoutingRule();component.saveRouting();
    expect(component.routingBusy()).toBeFalse();expect(component.routingAccountId()).toBe(17);
    expect(component.routingConfig()!.settings.rules.length).toBe(1);expect(component.routingError()).toContain('לא ניתן לשמור');
  });
  it('does not read or save settings in represented-client mode',()=>{
    represented=true;component.openRouting(17);component.saveRouting();expect(get).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
  });
});

describe('Rendered mailbox routing controls',()=>{
  it('renders multiple editable rules and sends changes made through the form',async()=>{
    const config={settings:{businessNumber:'123456789',rules:[{sender:'old@example.com',action:'BLOCK'}]},businesses:[{businessNumber:'123456789',businessName:'עסק לדוגמה'}]};
    const save=jasmine.createSpy().and.returnValue(of({settings:config.settings}));
    await TestBed.configureTestingModule({imports:[GmailIntegrationComponent],providers:[
      provideNoopAnimations(),provideRouter([]),
      {provide:AuthService,useValue:{isViewingAsClient:()=>false}},
      {provide:IntegrationsService,useValue:{getEmailRouting:()=>of(config),saveEmailRouting:save}},
      {provide:GmailSyncStateService,useValue:{refresh:()=>{},loading:signal(false),accounts:signal([]),status:signal(null)}},
      {provide:GenericService,useValue:{isMobile:signal(false)}},
      {provide:MessageService,useValue:{add:()=>{}}},{provide:ConfirmationService,useValue:{}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(GmailIntegrationComponent);fixture.detectChanges();
    fixture.componentInstance.openRouting(17);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const fieldset=fixture.nativeElement.querySelector('.email-routing-form') as HTMLElement;
    expect(fieldset.textContent).toContain('זיהוי חד־משמעי');
    const sender=fieldset.querySelector('input[type=email]') as HTMLInputElement;
    sender.value='new@example.com';sender.dispatchEvent(new Event('input'));fixture.detectChanges();await fixture.whenStable();
    const saveButton=Array.from(fieldset.querySelectorAll('button')).find(button=>button.textContent?.includes('שמור הגדרות'))!;
    saveButton.click();expect(save).toHaveBeenCalledOnceWith(17,jasmine.objectContaining({rules:[{sender:'new@example.com',action:'BLOCK'}]}));
    fixture.destroy();
  });
});


describe('Manual Gmail date selection', () => {
  let component: GmailIntegrationComponent;
  let pull: jasmine.Spy;
  beforeEach(() => {
    pull=jasmine.createSpy().and.returnValue(EMPTY);
    TestBed.configureTestingModule({providers:[
      {provide:AuthService,useValue:{isViewingAsClient:()=>false}},
      {provide:IntegrationsService,useValue:{importGmail:pull}},
      {provide:GmailSyncStateService,useValue:{refresh:()=>{},accounts:signal([{id:1,connected:true,initialImportCompleted:true}]),status:signal({minFromDate:'2025-01-01',maxToDate:'2026-11-21'})}},
      {provide:GenericService,useValue:{isMobile:signal(false)}},
      {provide:MessageService,useValue:{add:()=>{}}},
      {provide:ConfirmationService,useValue:{}},
    ]});
    component=TestBed.runInInjectionContext(()=>new GmailIntegrationComponent());
    component.openImportDialog();
  });
  it('requires both dates before sending',()=>{
    component.importSelected();expect(pull).not.toHaveBeenCalled();
    component.manualImportForm.patchValue({fromDate:new Date(2025,0,1)});
    component.importSelected();expect(pull).not.toHaveBeenCalled();
  });
  it('rejects reversed, out-of-bounds and invalid dates',()=>{
    for(const [fromDate,toDate] of [
      [new Date(2024,11,31),new Date(2025,0,1)],
      [new Date(2025,0,1),new Date(2026,10,22)],
      [new Date(2026,1,2),new Date(2026,1,1)],
      [new Date(NaN),new Date(2026,1,1)],
    ]) { component.manualImportForm.setValue({fromDate,toDate});component.importSelected(); }
    expect(pull).not.toHaveBeenCalled();
  });
  it('sends local calendar dates without a timezone shift and locks inputs',()=>{
    component.manualImportForm.setValue({fromDate:new Date(2025,0,1),toDate:new Date(2026,10,21)});
    component.importSelected();
    expect(pull).toHaveBeenCalledOnceWith([1],'2025-01-01','2026-11-21');
    expect(component.manualImportForm.disabled).toBeTrue();
    component.importSelected();expect(pull).toHaveBeenCalledTimes(1);
  });
  it('preserves dates and enables retry after an API failure',()=>{
    pull.and.returnValue(throwError(()=>new Error('failed')));
    component.manualImportForm.setValue({fromDate:new Date(2025,0,1),toDate:new Date(2025,0,1)});
    component.importSelected();
    expect(component.importDialogVisible()).toBeTrue();
    expect(component.manualImportForm.enabled).toBeTrue();
    expect(component.manualRangeValid()).toBeTrue();
  });
  it('resets dates when the dialog reopens',()=>{
    component.manualImportForm.setValue({fromDate:new Date(2025,0,1),toDate:new Date(2025,0,1)});
    component.closeImportDialog();component.openImportDialog();
    expect(component.manualImportForm.getRawValue()).toEqual({fromDate:null,toDate:null});
  });
});
