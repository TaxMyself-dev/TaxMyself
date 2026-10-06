import { of, throwError } from 'rxjs';
import { ClientsDashboardComponent } from './clients-dashboard.component';

describe('ClientsDashboardComponent admin view-as sync', () => {
  const buildComponent = (syncResult: any = { status: 'started' }) => {
    const adminPanelService = {
      syncUserIfEmpty: jasmine.createSpy().and.returnValue(of(syncResult)),
    };
    const authService = {
      loadViewAsUserData: jasmine.createSpy().and.returnValue(of(null)),
    };
    const clientPanelService = {
      setSelectedClient: jasmine.createSpy(),
    };
    const router = { navigate: jasmine.createSpy() };
    const messageService = { add: jasmine.createSpy() };
    const component = new ClientsDashboardComponent(
      adminPanelService as any,
      {} as any,
      {} as any,
      messageService as any,
      {} as any,
      authService as any,
      clientPanelService as any,
      router as any,
    );

    return {
      component,
      adminPanelService,
      authService,
      clientPanelService,
      router,
      messageService,
    };
  };

  beforeEach(() => sessionStorage.removeItem('tm.freshLoginSync'));

  it('asks the backend to sync before enabling impersonation and marks the next page as fresh', () => {
    const context = buildComponent({ status: 'started' });

    (context.component as any).enterAsUser('client-1', 'Client One');

    expect(context.adminPanelService.syncUserIfEmpty).toHaveBeenCalledWith('client-1');
    expect(context.clientPanelService.setSelectedClient).toHaveBeenCalledWith('client-1', 'Client One');
    expect(context.authService.loadViewAsUserData).toHaveBeenCalled();
    expect(context.router.navigate).toHaveBeenCalledWith(['/my-account']);
    expect(sessionStorage.getItem('tm.freshLoginSync')).toBe('true');
  });

  it('does not set the fresh-sync flag when the completed cache needs no refresh', () => {
    const context = buildComponent({ status: 'not_needed' });

    (context.component as any).enterAsUser('client-1', 'Client One');

    expect(sessionStorage.getItem('tm.freshLoginSync')).toBeNull();
    expect(context.router.navigate).toHaveBeenCalledWith(['/my-account']);
  });

  it('still enters the account and warns when the conditional sync request fails', () => {
    const context = buildComponent();
    context.adminPanelService.syncUserIfEmpty.and.returnValue(
      throwError(() => new Error('network')),
    );

    (context.component as any).enterAsUser('client-1', 'Client One');

    expect(context.messageService.add).toHaveBeenCalled();
    expect(context.clientPanelService.setSelectedClient).toHaveBeenCalledWith('client-1', 'Client One');
    expect(context.router.navigate).toHaveBeenCalledWith(['/my-account']);
  });
});
