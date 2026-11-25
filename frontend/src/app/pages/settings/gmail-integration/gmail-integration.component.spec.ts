import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { EMPTY, Subject, of, throwError } from 'rxjs';
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
      { provide: IntegrationsService, useValue: { getOutlookConnectUrl: connect,getGoogleConnectUrl: connect,getEmailRouting:()=>of({settings:{businessNumber:'123456789',rules:[]},businesses:[{businessNumber:'123456789',businessName:'עסק'}]}),getEmailRoutingOptions:()=>of({businesses:[{businessNumber:'123456789',businessName:'עסק'}]}), disconnectGoogleIntegration: () => throwError(() => new Error('remote failure')) } },
      { provide: GmailSyncStateService, useValue: { refresh, accounts: signal([]), status: signal(null) } },
      { provide: GenericService, useValue: { isMobile: signal(false) } },
      { provide: MessageService, useValue: { add: jasmine.createSpy() } },
      { provide: ConfirmationService, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new GmailIntegrationComponent());
  });
  it('does not claim an old unverified connection was revoked by the provider',()=>{
    const text=component.connectionIssueMessage({lastSyncError:null} as any);
    expect(text).toContain('לא ניתן לאמת');expect(text).not.toContain('פגה');expect(text).not.toContain('בוטלה');
  });
  it('distinguishes permissions, reconnect and retry messages',()=>{
    expect(component.syncErrorMessage({lastSyncError:'EMAIL_ACCESS_DENIED'} as any)).toContain('הרשאות');
    expect(component.syncErrorMessage({lastSyncError:'EMAIL_RECONNECT_REQUIRED'} as any)).toContain('לחבר מחדש');
    expect(component.syncErrorMessage({lastSyncError:'EMAIL_RETRY_PENDING'} as any)).toContain('אוטומטית');
    expect(component.syncErrorMessage({lastSyncError:'secret raw provider failure'} as any)).not.toContain('secret');
  });
  it('clears Outlook loading before navigation and allows retry after Back', () => {
    const response = new Subject<{url: string}>();
    connect.and.returnValue(response);
    const navigate = spyOn<any>(component, 'navigateToProvider').and.callFake(() => {
      expect(component.connecting()).toBeFalse();
    });
    component.connectGmail(undefined, 'MICROSOFT');
    expect(component.connectingProvider()).toBe('MICROSOFT');
    component.connectGmail();expect(connect).toHaveBeenCalledTimes(1);
    response.next({url:'https://connect.composio.dev/synthetic'});response.complete();
    expect(navigate).toHaveBeenCalledTimes(1);
    connect.and.returnValue(EMPTY);component.connectGmail(undefined,'MICROSOFT');
    expect(connect).toHaveBeenCalledTimes(2);
  });
  it('clears loading and refreshes verified state on browser-history restore', () => {
    component.connectingProvider.set('MICROSOFT');
    component.onPageShow({persisted:true} as PageTransitionEvent);
    expect(component.connecting()).toBeFalse();expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('preserves active requests on ordinary pageshow and owner-only refresh on restore', () => {
    component.connectingProvider.set('GOOGLE');component.onPageShow({persisted:false} as PageTransitionEvent);
    expect(component.connectingProvider()).toBe('GOOGLE');viewingAsClient=true;
    component.onPageShow({persisted:true} as PageTransitionEvent);
    expect(component.connecting()).toBeFalse();expect(refresh).not.toHaveBeenCalled();
  });
  it('clears loading on failed or empty connect responses', () => {
    connect.and.returnValue(throwError(()=>new Error('unavailable')));
    component.connectGmail(undefined,'MICROSOFT');expect(component.connecting()).toBeFalse();
    connect.and.returnValue(EMPTY);component.connectGmail();expect(component.connecting()).toBeFalse();
  });

  it('passes the selected Outlook row when reconnecting', () => {
    component.connectGmail(43, 'MICROSOFT');
    expect(connect).toHaveBeenCalledOnceWith(43,'123456789');
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

describe('Latest Gmail pull presentation',()=>{
  it('renders one closed summary per mailbox and keeps processing active after pull completion',async()=>{
    const account={id:17,connected:true,initialImportCompleted:true,lastSyncStatus:'SUCCESS'};
    const run={id:'latest',integrationId:17,pull_state:'COMPLETE',processing_state:'RUNNING',messages:{SCANNED:7,BLOCKED:2},attachments:{IMPORTED:4,DUPLICATE:1},documents:{READY:4}};
    const status=signal<any>({runs:[run,{...run,id:'old',processing_state:'COMPLETE'}]});
    await TestBed.configureTestingModule({imports:[GmailIntegrationComponent],providers:[
      provideNoopAnimations(),provideRouter([]),providePrimeNG({theme:{preset:Aura}}),
      {provide:AuthService,useValue:{isViewingAsClient:()=>false}},
      {provide:IntegrationsService,useValue:{}},
      {provide:GmailSyncStateService,useValue:{refresh:()=>{},loading:signal(false),accounts:signal([account]),status}},
      {provide:GenericService,useValue:{isMobile:signal(false)}},{provide:MessageService,useValue:{add:()=>{}}},{provide:ConfirmationService,useValue:{}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(GmailIntegrationComponent);
    Object.defineProperty(fixture.componentInstance,'showRunDiagnostics',{value:false,configurable:true});
    fixture.detectChanges();
    const host:HTMLElement=fixture.nativeElement;
    const details=host.querySelector('details.gmail-last-run') as HTMLDetailsElement;
    expect(host.querySelectorAll('details.gmail-last-run').length).toBe(1);expect(details.open).toBeFalse();
    expect(host.querySelector('.gmail-running')?.textContent).toContain('פעילה');
    expect(host.querySelector('.gmail-run-stages')?.textContent).toContain('בתהליך');
    expect(details.querySelectorAll('.gmail-run-summary span').length).toBe(4);
    expect(details.textContent).toContain('כמות הודעות: 9');expect(details.textContent).toContain('פריטי מקור (קבצים וקישורים): 5');
    expect(host.querySelector('.gmail-run-diagnostics')).toBeNull();
    details.open=true;fixture.detectChanges();expect(details.open).toBeTrue();
    Object.defineProperty(fixture.componentInstance,'showRunDiagnostics',{value:true});fixture.detectChanges();
    expect(host.querySelector('.gmail-run-diagnostics')).not.toBeNull();
    status.set({runs:[{...run,processing_state:'COMPLETE'}]});fixture.detectChanges();
    expect(host.querySelector('.gmail-running')).toBeNull();
    status.set({runs:[{...run,scan_state:'DONE',pull_state:'PARTIAL',processing_state:'ATTENTION',error_code:null,attachments:{BLOCKED:2},documents:{PASSWORD_REQUIRED:1},issues:[{scope:'link',state:'BLOCKED',code:'LINK_ACCESS_REQUIRED',count:2}]}]});
    fixture.detectChanges();
    expect(details.textContent).toContain('נדרשת התחברות או הרשאה');
    expect(details.textContent).toContain('מסמכים מוגנים בסיסמה');
    expect(details.textContent).not.toContain('כשלים:');
    expect(host.textContent).toContain('סריקת המיילים הסתיימה');
    expect(Array.from(details.querySelectorAll('button')).some(b=>b.textContent?.includes('נסה שוב לעבד'))).toBeFalse();
    fixture.destroy();
  });
});

describe('mailbox-wide processing retries',()=>{
 let component:GmailIntegrationComponent,send:jasmine.Spy,refresh:jasmine.Spy,viewing=false;
 beforeEach(()=>{viewing=false;send=jasmine.createSpy().and.returnValue(new Subject());refresh=jasmine.createSpy();TestBed.configureTestingModule({providers:[
  {provide:AuthService,useValue:{isViewingAsClient:()=>viewing}}, {provide:IntegrationsService,useValue:{retryMailboxProcessing:send}},
  {provide:GmailSyncStateService,useValue:{refresh,status:signal(null),accounts:signal([])}},
  {provide:GenericService,useValue:{isMobile:signal(false)}},{provide:MessageService,useValue:{add:jasmine.createSpy()}},{provide:ConfirmationService,useValue:{}}
 ]});component=TestBed.runInInjectionContext(()=>new GmailIntegrationComponent())});
 it('uses the clicked account and blocks repeated clicks',()=>{component.retryMailboxProcessing(17);component.retryMailboxProcessing(17);component.retryMailboxProcessing(18);expect(send).toHaveBeenCalledOnceWith(17);expect(component.retryAccountId()).toBe(17)});
 it('does not mutate mailboxes in represented-client mode',()=>{viewing=true;component.retryMailboxProcessing(17);expect(send).not.toHaveBeenCalled()});
 it('refreshes server state and reports unsafe skips',()=>{send.and.returnValue(of({results:[{fileId:'a',status:'UNKNOWN_OUTCOME'}],retried:2,skipped:1}));component.retryMailboxProcessing(17);expect(component.retryAccountId()).toBeNull();expect(refresh).toHaveBeenCalled();expect(component.retryFeedback()[17]).toContain('בדיקה ידנית')});
 it('unlocks after configuration errors',()=>{send.and.returnValue(throwError(()=>({status:503})));component.retryMailboxProcessing(17);expect(component.retryAccountId()).toBeNull();expect(component.retryFeedback()[17]).toContain('הגדרות')});
});

describe('rendered retry warning',()=>{
 for(const width of [375,1100])it('shows a working mailbox retry control at '+width+'px',async()=>{
  document.body.style.display='block';const send=jasmine.createSpy().and.returnValue(new Subject());
  const account={id:17,accountEmail:'mail@example.com',connected:true,status:'ACTIVE',initialImportCompleted:true,lastSyncStatus:'SUCCESS',passwordRequiredCount:8};
  const status={runs:[{id:'run',integrationId:17,pull_state:'COMPLETE',processing_state:'ATTENTION',messages:{},attachments:{},documents:{WORK_BLOCKED:13}}]};
  await TestBed.configureTestingModule({imports:[GmailIntegrationComponent],providers:[provideNoopAnimations(),provideRouter([]),providePrimeNG({theme:{preset:Aura}}),
   {provide:AuthService,useValue:{isViewingAsClient:()=>false}}, {provide:IntegrationsService,useValue:{retryMailboxProcessing:send}},
   {provide:GmailSyncStateService,useValue:{refresh:()=>{},status:signal(status),accounts:signal([account]),loading:signal(false),isStarting:()=>false}},
   {provide:GenericService,useValue:{isMobile:signal(width<600)}},{provide:MessageService,useValue:{add:()=>{}}},{provide:ConfirmationService,useValue:{}}
  ]}).compileComponents();
  const fixture=TestBed.createComponent(GmailIntegrationComponent);fixture.nativeElement.style.display='block';fixture.nativeElement.style.width=width+'px';fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const warning=fixture.nativeElement.querySelector('.gmail-error') as HTMLElement;expect(warning).not.toBeNull();
  const button=Array.from(warning.querySelectorAll('button')).find(b=>b.textContent?.trim() === 'נסה שוב לעבד מסמכים')!;
  expect(button).toBeTruthy();expect(button.classList.contains('black')).toBeTrue();expect(warning.textContent).not.toContain('יחודש עיבוד המסמכים');expect(button.disabled).toBeFalse();expect(warning.scrollWidth).toBeLessThanOrEqual(warning.clientWidth+1);
  button.click();fixture.detectChanges();expect(send).toHaveBeenCalledOnceWith(17);expect(button.disabled).toBeTrue();fixture.destroy();
 });
});
