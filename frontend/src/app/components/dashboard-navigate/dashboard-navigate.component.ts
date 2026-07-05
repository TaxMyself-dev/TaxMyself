import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { IItemNavigate } from 'src/app/shared/interface';
import { RouterModule } from '@angular/router';


@Component({
  selector: 'app-dashboard-navigate',
  templateUrl: './dashboard-navigate.component.html',
  styleUrls: ['./dashboard-navigate.component.scss'],
  imports: [CardModule, RouterModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardNavigateComponent  implements OnInit {

 cardItem = input<IItemNavigate>();
 /** Dims the card and blocks navigation (DISABLE behavior). */
 locked = input<boolean>(false);
 /** When true, all clicks are emitted via cardClick — caller owns navigation and access handling. */
 controlledNavigation = input<boolean>(false);
 /** Fires when the card is clicked and locked=true, controlledNavigation=false. */
 lockedClick = output<void>();
 /** Fires on every click when controlledNavigation=true (regardless of locked state). */
 cardClick = output<void>();
 router = inject(Router);
  constructor() { }

  ngOnInit() {}

}
