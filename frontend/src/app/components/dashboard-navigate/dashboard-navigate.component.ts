import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
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
 router = inject(Router);
  constructor() { }

  ngOnInit() {}

  // onButtonClicked(selectedItem: IItemNavigate): void {
  //   if (selectedItem.link != "" ){
  //     this.router.navigate([selectedItem.link])
  //   }

  // }

}
