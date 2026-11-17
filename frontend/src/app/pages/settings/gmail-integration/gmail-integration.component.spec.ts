import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, throwError } from 'rxjs';
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
