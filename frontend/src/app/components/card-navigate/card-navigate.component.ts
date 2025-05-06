import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { IItemNavigate } from 'src/app/shared/interface';
@Component({
  selector: 'app-card-navigate',
  templateUrl: './card-navigate.component.html',
  styleUrls: ['./card-navigate.component.scss'],
  imports: [CardModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
  
})
export class CardNavigateComponent  implements OnInit {
 cardItem = input<IItemNavigate>();
 router = inject(Router);
  constructor() { }

  ngOnInit() {}

  onButtonClicked(selectedItem: IItemNavigate): void {
    console.log("onButtonClicked");
    
    // if (selectedItem.link === "/add-expenses") {
    //   this.openModalAddExpense();
    //   return;
    // }
    if (selectedItem.link != "" ){
      this.router.navigate([selectedItem.link])
    }
      // For add class to selected item
      // this.navigationItems.forEach((item: IItemNavigate) => 
      // item.selected = item.name === selectedItem.name
      // )
    
    // this.onNavButtonClicked.emit(selectedItem);
  }

}
