import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { IItemNavigate } from '../interface';

@Component({
  selector: 'app-item-navigate',
  templateUrl: './item-navigate.component.html',
  styleUrls: ['./item-navigate.component.scss'],
})
export class ItemNavigateComponent {

  @Input() navigationItems: IItemNavigate[];

  @Output() onNavButtonClicked = new EventEmitter<IItemNavigate>();

  constructor() { }

  onButtonClicked(selectedItem: IItemNavigate): void {
    this.navigationItems.forEach((item: IItemNavigate) => 
      item.selected = item.name === selectedItem.name
    )
    this.onNavButtonClicked.emit(selectedItem);
  }

}
