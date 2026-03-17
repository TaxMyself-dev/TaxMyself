import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, input, ViewChild } from '@angular/core';
import { Menubar, MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { IMenuItem } from './topNav-interface';
import { ImageModule } from 'primeng/image';
import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

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

    readonly ButtonColor = ButtonColor;
    readonly ButtonSize = ButtonSize;

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