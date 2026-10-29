import { of, Subject } from 'rxjs';

import { AppComponent } from './app.component';

describe('AppComponent selected-client billing refresh', () => {
  function createHost(isLoggedIn: boolean) {
    const selectedClientId$ = new Subject<string | null>();
    const selectedClientName$ = new Subject<string | null>();
    const refreshBillingState = jasmine.createSpy('refreshBillingState');

    const host: any = {
      destroy$: new Subject<void>(),
      clientPanelService: {
        selectedClientId$,
        selectedClientName$,
        getSelectedClientId: () => null,
        getSelectedClientName: () => null,
      },
      billingStateService: { refreshBillingState },
      authService: {
        isLoggedIn,
        loadViewAsUserData: () => of(null),
        clearViewAsUserData: jasmine.createSpy('clearViewAsUserData'),
        getUserDataFromLocalStorage: () => null,
      },
      genericService: { loadBusinessesFromServer: () => Promise.resolve() },
      updateAdminMenuItems: jasmine.createSpy('updateAdminMenuItems'),
      getRoleUser: jasmine.createSpy('getRoleUser'),
    };

    (AppComponent.prototype as any).subscribeToSelectedClient.call(host);
    return { selectedClientId$, refreshBillingState };
  }

  it('does not call the protected billing endpoint during signed-out startup', () => {
    const { selectedClientId$, refreshBillingState } = createHost(false);

    selectedClientId$.next(null);

    expect(refreshBillingState).not.toHaveBeenCalled();
  });

  it('refreshes billing state when an authenticated user changes identity', () => {
    const { selectedClientId$, refreshBillingState } = createHost(true);

    selectedClientId$.next('client-user-id');

    expect(refreshBillingState).toHaveBeenCalledTimes(1);
  });
});
