import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { IItemNavigate } from 'src/app/shared/interface';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-card-navigate',
  templateUrl: './card-navigate.component.html',
  styleUrls: ['./card-navigate.component.scss'],
  imports: [CardModule, RouterModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CardNavigateComponent implements OnInit {
  cardItem = input<IItemNavigate>();
  /** When true, all clicks are emitted via cardClick — caller owns navigation and access handling. */
  controlledNavigation = input<boolean>(false);
  /** Fires on every click when controlledNavigation=true. */
  cardClick = output<void>();

  router = inject(Router);

  constructor() {}

  ngOnInit() {}
}
