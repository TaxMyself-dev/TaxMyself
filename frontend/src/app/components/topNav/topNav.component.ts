import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, input, ViewChild } from '@angular/core';
import { Menubar, MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { IMenuItem } from './topNav-interface';
import { ImageModule } from 'primeng/image';
import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { AccessService, FeatureState } from 'src/app/services/access.service';
import { AccessHandlerService } from 'src/app/services/access-handler.service';
import { AppFeature } from 'src/app/shared/access-control';

@Component({
    selector: 'app-p-topNav',
    standalone: true,
    templateUrl: './topNav.component.html',
    styleUrls: ['./topNav.component.scss'],
    imports: [ButtonModule, MenubarModule, ImageModule, ButtonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopNavComponent {
    @ViewChild(Menubar) menubar!: Menubar;

    menuItems = input<IMenuItem[]>([]);

    private readonly router = inject(Router);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly accessService = inject(AccessService);
    private readonly accessHandlerService = inject(AccessHandlerService);

    readonly ButtonColor = ButtonColor;
    readonly ButtonSize = ButtonSize;

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