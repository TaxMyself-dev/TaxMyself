import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
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
      { provide: IntegrationsService, useValue: { getGoogleConnectUrl: connect,getEmailRouting:()=>of({settings:{businessNumber:'123456789',rules:[]},businesses:[{businessNumber:'123456789',businessName:'עסק'}]}),getEmailRoutingOptions:()=>of({businesses:[{businessNumber:'123456789',businessName:'עסק'}]}), disconnectGoogleIntegration: () => throwError(() => new Error('remote failure')) } },
      { provide: GmailSyncStateService, useValue: { refresh, accounts: signal([]), status: signal(null) } },
      { provide: GenericService, useValue: { isMobile: signal(false) } },
      { provide: MessageService, useValue: { add: jasmine.createSpy() } },
      { provide: ConfirmationService, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new GmailIntegrationComponent());
  });
  it('passes the selected row when reconnecting', () => {
    component.connectGmail(42);
    expect(connect).toHaveBeenCalledOnceWith(42,'123456789');
    expect(component.connectionDialogVisible()).toBeFalse();
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
    component.routingRules()[0].patchValue({sender:'a@example.com',action:'BLOCK'});
    component.routingRules()[1].patchValue({sender:'b@example.com',action:'BUSINESS',businessNumber:'123456789'});
    component.removeRoutingRule(0);component.saveRouting();component.saveRouting();
    expect(save).toHaveBeenCalledOnceWith(17,{businessNumber:'123456789',rules:[{sender:'b@example.com',action:'BUSINESS',businessNumber:'123456789'}]});
  });
  it('retains editable rules after a rejected save and permits retry',()=>{
    save.and.returnValue(throwError(()=>new Error('invalid rules')));
    component.openRouting(17);component.addRoutingRule();component.routingRules()[0].patchValue({sender:'a@example.com'});component.saveRouting();
    expect(component.routingBusy()).toBeFalse();expect(component.routingAccountId()).toBe(17);
    expect(component.routingRules().length).toBe(1);expect(component.routingError()).toContain('לא ניתן לשמור');
  });
  it('does not read or save settings in represented-client mode',()=>{
    represented=true;component.openRouting(17);component.saveRouting();expect(get).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
  });
});

describe('Business selection before Google connect',()=>{
  function setup(businesses:{businessNumber:string;businessName:string}[],previous:string|null=null){
    const connect=jasmine.createSpy().and.returnValue(EMPTY);
    TestBed.configureTestingModule({providers:[
      {provide:AuthService,useValue:{isViewingAsClient:()=>false}},
      {provide:IntegrationsService,useValue:{getGoogleConnectUrl:connect,getEmailRoutingOptions:()=>of({businesses}),getEmailRouting:()=>of({businesses,settings:{businessNumber:previous,rules:[]}})}},
      {provide:GmailSyncStateService,useValue:{refresh:()=>{},accounts:signal([]),status:signal(null)}},
      {provide:GenericService,useValue:{isMobile:signal(false)}},{provide:MessageService,useValue:{add:()=>{}}},{provide:ConfirmationService,useValue:{}},
    ]});
    return {component:TestBed.runInInjectionContext(()=>new GmailIntegrationComponent()),connect};
  }
  const first={businessNumber:'123456789',businessName:'עסק א'},second={businessNumber:'987654321',businessName:'עסק ב'};
  it('goes directly to Google for one business without displaying a selection dialog',()=>{
    const t=setup([first]);t.component.connectGmail();
    expect(t.component.connectionDialogVisible()).toBeFalse();expect(t.connect).toHaveBeenCalledOnceWith(undefined,'123456789');
  });
  it('waits for an explicit valid business when more than one exists',()=>{
    const t=setup([first,second]);t.component.connectGmail();
    expect(t.component.connectionDialogVisible()).toBeTrue();expect(t.connect).not.toHaveBeenCalled();
    t.component.confirmConnection();expect(t.connect).not.toHaveBeenCalled();
    t.component.connectionForm.setValue({businessNumber:'foreign'});t.component.confirmConnection();expect(t.connect).not.toHaveBeenCalled();
    t.component.connectionForm.setValue({businessNumber:'987654321'});t.component.confirmConnection();
    expect(t.connect).toHaveBeenCalledOnceWith(undefined,'987654321');
  });
  it('preselects the existing business on reconnect and preserves the chosen mailbox id',()=>{
    const t=setup([first,second],'987654321');t.component.connectGmail(42);
    expect(t.component.connectionForm.value.businessNumber).toBe('987654321');expect(t.connect).not.toHaveBeenCalled();
    t.component.confirmConnection();expect(t.connect).toHaveBeenCalledOnceWith(42,'987654321');
  });
  it('does not initiate Google when the account has no businesses',()=>{
    const t=setup([]);t.component.connectGmail();
    expect(t.component.connectionError()).toContain('להוסיף עסק');expect(t.connect).not.toHaveBeenCalled();
  });
});

describe('Rendered mailbox routing controls',()=>{
  let originalBodyDisplay:string;
  beforeEach(()=>{originalBodyDisplay=document.body.style.display;document.body.style.display='block';});
  afterEach(()=>{document.body.style.display=originalBodyDisplay;});
  it('renders the multi-business choice with application controls and a non-overflowing action footer',async()=>{
    const connect=jasmine.createSpy().and.returnValue(EMPTY);
    await TestBed.configureTestingModule({imports:[GmailIntegrationComponent],providers:[
      provideNoopAnimations(),provideRouter([]),providePrimeNG({theme:{preset:Aura}}),
      {provide:AuthService,useValue:{isViewingAsClient:()=>false}},
      {provide:IntegrationsService,useValue:{getGoogleConnectUrl:connect,getEmailRoutingOptions:()=>of({businesses:[{businessNumber:'123456789',businessName:'עסק א'},{businessNumber:'987654321',businessName:'עסק ב'}]})}},
      {provide:GmailSyncStateService,useValue:{refresh:()=>{},loading:signal(false),accounts:signal([]),status:signal(null)}},
      {provide:GenericService,useValue:{isMobile:signal(false)}},{provide:MessageService,useValue:{add:()=>{}}},{provide:ConfirmationService,useValue:{}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(GmailIntegrationComponent);fixture.detectChanges();fixture.componentInstance.connectGmail();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const dialog=fixture.nativeElement.querySelector('.email-connect-dialog') as HTMLElement;
    expect(dialog.querySelector('app-input-select')).not.toBeNull();
    const button=Array.from(dialog.querySelectorAll('button')).find(item=>item.textContent?.includes('המשך לחיבור Google'))!;
    expect(button.disabled).toBeTrue();expect(connect).not.toHaveBeenCalled();
    fixture.componentInstance.connectionForm.setValue({businessNumber:'987654321'});fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const footer=dialog.querySelector('.email-routing-footer') as HTMLElement;
    expect(button.getBoundingClientRect().height).toBeGreaterThan(28);expect(footer.scrollWidth).toBeLessThanOrEqual(footer.clientWidth+1);
    button.click();expect(connect).toHaveBeenCalledOnceWith(undefined,'987654321');fixture.destroy();
  });
  it('renders multiple editable rules and sends changes made through the form',async()=>{
    const config={settings:{businessNumber:'123456789',rules:[{sender:'old@example.com',action:'BLOCK'}]},businesses:[{businessNumber:'123456789',businessName:'עסק לדוגמה'}]};
    const save=jasmine.createSpy().and.returnValue(of({settings:config.settings}));
    await TestBed.configureTestingModule({imports:[GmailIntegrationComponent],providers:[
      provideNoopAnimations(),provideRouter([]),providePrimeNG({theme:{preset:Aura}}),
      {provide:AuthService,useValue:{isViewingAsClient:()=>false}},
      {provide:IntegrationsService,useValue:{getEmailRouting:()=>of(config),saveEmailRouting:save}},
      {provide:GmailSyncStateService,useValue:{refresh:()=>{},loading:signal(false),accounts:signal([]),status:signal(null)}},
      {provide:GenericService,useValue:{isMobile:signal(false)}},
      {provide:MessageService,useValue:{add:()=>{}}},{provide:ConfirmationService,useValue:{}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(GmailIntegrationComponent);fixture.detectChanges();
    fixture.componentInstance.openRouting(17);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const fieldset=fixture.nativeElement.querySelector('.email-routing-content') as HTMLElement;
    expect(fieldset.textContent).toContain('זיהוי עסק חד־משמעי');
    expect(fieldset.querySelector('app-input-select')).not.toBeNull();
    const sender=fieldset.querySelector('app-input-text input') as HTMLInputElement;
    sender.value='new@example.com';sender.dispatchEvent(new Event('input'));fixture.detectChanges();await fixture.whenStable();
    const saveButton=Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button=>button.textContent?.includes('שמור הגדרות'))!;
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    expect(saveButton.closest('app-p-button')).not.toBeNull();
    expect(saveButton.getBoundingClientRect().height).toBeGreaterThan(28);
    const grid=fieldset.querySelector('.email-routing-rule-fields') as HTMLElement;
    expect(getComputedStyle(grid).gridTemplateColumns.split(' ').length).toBe(window.innerWidth<=520?1:2);
    expect(sender.getBoundingClientRect().width).toBeLessThanOrEqual(grid.getBoundingClientRect().width+1);
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
