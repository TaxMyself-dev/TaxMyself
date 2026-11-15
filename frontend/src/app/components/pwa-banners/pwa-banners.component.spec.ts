import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PwaBannersComponent } from './pwa-banners.component';
import { ConnectivityState, NetworkStatusService } from '../../services/pwa/network-status.service';
import { PwaInstallService } from '../../services/pwa/pwa-install.service';
import { PwaUpdateService } from '../../services/pwa/pwa-update.service';
import { RuntimeContextService } from '../../services/pwa/runtime-context.service';

describe('PwaBannersComponent update notification', () => {
  let versions: Subject<VersionEvent>;
  let installed: ReturnType<typeof signal<boolean>>;

  async function setup(enabled = true) {
    versions = new Subject<VersionEvent>();
    installed = signal(false);
    await TestBed.configureTestingModule({
      imports: [PwaBannersComponent],
      providers: [
        { provide: RuntimeContextService, useValue: { isInstalledPwa: installed } },
        { provide: SwUpdate, useValue: {
          isEnabled: enabled,
          versionUpdates: versions.asObservable(),
          unrecoverable: new Subject<{ reason: string }>(),
          activateUpdate: jasmine.createSpy('activateUpdate'),
          checkForUpdate: jasmine.createSpy('checkForUpdate'),
        } },
        { provide: NetworkStatusService, useValue: {
          state: signal(ConnectivityState.ONLINE),
          offlineNavigationBlockedAt: signal(0),
          isConnectivityFailure: () => false,
        } },
        { provide: PwaInstallService, useValue: {
          canOfferInstall: signal(false), showIosHint: signal(false),
        } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PwaBannersComponent);
    fixture.detectChanges();
    return fixture;
  }

  function ready() {
    versions.next({ type: 'VERSION_READY', currentVersion: { hash: 'old' }, latestVersion: { hash: 'new' } });
  }

  it('offers a downloaded version in a normal browser tab without activating automatically', async () => {
    const fixture = await setup();
    const activate = spyOn(TestBed.inject(PwaUpdateService), 'activateUpdate');
    const banner = () => fixture.nativeElement.querySelector('.pwa-banner--update');
    expect(banner()).toBeNull();
    versions.next({ type: 'VERSION_DETECTED', version: { hash: 'new' } });
    fixture.detectChanges();
    expect(banner()).toBeNull();
    ready();
    fixture.detectChanges();
    expect(installed()).toBeFalse();
    expect(banner().textContent).toContain('גרסה חדשה של KeepInTax זמינה.');
    expect(banner().querySelector('button').textContent).toContain('עדכן עכשיו');
    expect(activate).not.toHaveBeenCalled();
  });

  it('activates only after clicking Update and disables the button during activation', async () => {
    const fixture = await setup();
    const update = TestBed.inject(PwaUpdateService);
    const activate = spyOn(update, 'activateUpdate').and.callFake(async () => { update.activating.set(true); });
    ready();
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.pwa-banner--update button');
    button.click();
    fixture.detectChanges();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('מעדכן');
  });

  it('continues to show the same notification in an installed app', async () => {
    const fixture = await setup();
    installed.set(true);
    ready();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pwa-banner--update')).not.toBeNull();
  });

  it('does not offer updates when service workers are disabled', async () => {
    const fixture = await setup(false);
    ready();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pwa-banner--update')).toBeNull();
  });
});
