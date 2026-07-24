import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, input, output, ViewChild } from '@angular/core';
import { Menubar, MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { IMenuItem } from './topNav-interface';
import { ImageModule } from 'primeng/image';
import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { MenuButtonComponent } from '../menu-button/menu-button.component';
import { MenuButtonItem } from '../menu-button/menu-button.model';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { AccessService, FeatureState } from 'src/app/services/access.service';
import { AccessHandlerService } from 'src/app/services/access-handler.service';
import { AppFeature } from 'src/app/shared/access-control';
import { PwaInstallService } from 'src/app/services/pwa/pwa-install.service';
import { AppRefreshService } from 'src/app/services/pwa/app-refresh.service';

@Component({
    selector: 'app-p-topNav',
    standalone: true,
    templateUrl: './topNav.component.html',
    styleUrls: ['./topNav.component.scss'],
    imports: [ButtonModule, MenubarModule, ImageModule, ButtonComponent, MenuButtonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopNavComponent {
    @ViewChild(Menubar) menubar!: Menubar;

    menuItems = input<IMenuItem[]>([]);

    /** Emitted when the user picks "logout" from the settings menu. */
    readonly logout = output<void>();

    private readonly router = inject(Router);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly accessService = inject(AccessService);
    private readonly accessHandlerService = inject(AccessHandlerService);
    private readonly pwaInstall = inject(PwaInstallService);
    private readonly appRefresh = inject(AppRefreshService);

    readonly ButtonColor = ButtonColor;
    readonly ButtonSize = ButtonSize;

    /**
     * Rows for the settings menu-button (replaces the old settings gear link).
     *
     * "רענון" appears only in the installed PWA: a browser tab already has a
     * reload button, and Chrome's native pull-to-refresh is unavailable in
     * standalone mode (and impossible here anyway — the document root never
     * scrolls, see `.app-content { overflow: hidden }`).
     *
     * It refreshes state through the services rather than reloading the
     * document, so unsaved forms and the current route are preserved and no
     * mutation is repeated.
     */
    readonly settingsMenuItems = computed<MenuButtonItem[]>(() => [
        ...(this.pwaInstall.isStandalone()
            ? [{
                type: 'action' as const,
                id: 'refresh',
                label: 'רענון',
                icon: 'pi pi-refresh',
                disabled: this.appRefresh.isRefreshing(),
                action: () => void this.appRefresh.refreshSharedState(),
              }]
            : []),
        { type: 'action', id: 'settings', label: 'הגדרות', icon: 'pi pi-cog', action: () => this.router.navigate(['/settings']) },
        { type: 'separator' },
        { type: 'action', id: 'logout', label: 'התנתקות', icon: 'pi pi-sign-out', action: () => this.logout.emit() },
    ]);

    private readonly currentUrl = toSignal(
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            map(e => (e as NavigationEnd).urlAfterRedirects),
        ),
        { initialValue: this.router.url },
    );

    readonly isOnDocCreate = computed(() => this.currentUrl().startsWith('/doc-create'));

    readonly access: { createDocument: ReturnType<typeof computed<FeatureState>> } = {
      createDocument: computed(() => this.accessService.getFeatureState(AppFeature.DOC_CREATE_BUTTON_PIVOT)),
    };

    onCreateDocumentClick(): void {
      const result = this.accessHandlerService.handleFeatureAccess(AppFeature.DOC_CREATE_BUTTON_PIVOT);
      if (result.allowed) {
        this.router.navigate(['/doc-create']);
      }
    }

    constructor() {
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            takeUntilDestroyed(),
        ).subscribe(() => {
            if (this.menubar?.mobileActive) {
                this.menubar.mobileActive = false;
                this.menubar.hide();
                this.cdr.detectChanges();
            }
        });
    }
}