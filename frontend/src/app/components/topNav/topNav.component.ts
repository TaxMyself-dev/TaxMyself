import { Component, input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { IMenuItem } from './topNav-interface';
import { ImageModule } from 'primeng/image';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';

@Component({
    selector: 'app-p-topNav',
    standalone: true,
    templateUrl: './topNav.component.html',
    styleUrls: ['./topNav.component.scss'],
    imports: [CommonModule, ButtonModule, MenubarModule, ImageModule, ButtonComponent],
})
export class TopNavComponent implements OnInit {
    menuItems = input<IMenuItem[]>([]);

    readonly ButtonColor = ButtonColor
    readonly ButtonSize = ButtonSize
    constructor() { }

    ngOnInit() { }
}