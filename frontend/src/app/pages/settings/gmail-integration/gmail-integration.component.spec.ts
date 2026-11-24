import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, Subject, throwError } from 'rxjs';
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
      { provide: IntegrationsService, useValue: { getOutlookConnectUrl: connect, getGoogleConnectUrl: connect, disconnectGoogleIntegration: () => throwError(() => new Error('remote failure')) } },
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
    expect(connect).toHaveBeenCalledOnceWith(43);
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
