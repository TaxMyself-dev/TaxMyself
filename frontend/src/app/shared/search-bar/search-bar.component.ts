import { Component, OnInit, Output, EventEmitter, TemplateRef, Input } from '@angular/core';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.scss']
})

export class SearchBarComponent {

  @Input() customTemplate: TemplateRef<any>;
  @Output() onSearchClick = new EventEmitter<void>();

  constructor() { }

  onSearchClicked(event: any): void {
    console.log(event);
    //this.onSearchClick?.emit();
  }
  
}
