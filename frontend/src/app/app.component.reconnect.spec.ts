import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { AppComponent } from './app.component';
import { AccessService } from './services/access.service';
import { AppRefreshService } from './services/pwa/app-refresh.service';
import { NetworkStatusService } from './services/pwa/network-status.service';
import { BillingStateService } from './services/billing-state.service';
import { GenericService } from './services/generic.service';
import { StartupService } from './services/startup.service';

describe('AppComponent reconnect recovery', () => {
  it('does not retrigger when the refresh reads or changes unrelated signals', () => {
    const reconnectedAt = signal(0);
    const refreshState = signal(0);
    const refreshSharedState = jasmine
      .createSpy('refreshSharedState')
      .and.callFake(async () => {
        refreshState();
      });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: GenericService,
          useValue: { businesses: signal([]) },
        },
        {
          provide: BillingStateService,
          useValue: {
            billingState: signal(null),
            isLoading: signal(false),
            error: signal(null),
            hasBillingOverride: () => false,
            effectiveStatus: () => null,
          },
        },
        {
          provide: AccessService,
          useValue: { getFeatureState: () => ({ visible: true }) },
        },
        {
          provide: NetworkStatusService,
          useValue: { reconnectedAt },
        },
        {
          provide: AppRefreshService,
          useValue: { refreshSharedState },
        },
        {
          provide: StartupService,
          useValue: {
            whenReady: () => Promise.resolve(),
            releaseStartupLoader: jasmine.createSpy(),
          },
        },
      ],
    });

    const router = { events: NEVER };
    TestBed.runInInjectionContext(
      () =>
        new AppComponent(
          {} as any,
          router as any,
          {} as any,
          {} as any,
          {} as any,
          {} as any,
        ),
    );

    TestBed.flushEffects();
    expect(refreshSharedState).not.toHaveBeenCalled();

    reconnectedAt.set(1);
    TestBed.flushEffects();
    expect(refreshSharedState).toHaveBeenCalledTimes(1);

    refreshState.set(1);
    TestBed.flushEffects();
    expect(refreshSharedState).toHaveBeenCalledTimes(1);
  });
});
