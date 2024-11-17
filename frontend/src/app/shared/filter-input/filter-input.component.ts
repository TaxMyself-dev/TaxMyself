import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-filter-input',
  templateUrl: './filter-input.component.html',
  styleUrls: ['./filter-input.component.scss', '../../shared/shared-styling.scss'],
})
export class FilterInputComponent  implements OnInit {

  @Input() inputLabelName: string = "חיפוש";

  
  @Output() filterBy: EventEmitter<string> = new EventEmitter<string>();  

  constructor() { }

  ngOnInit() {}

  onSearch(event): void {
    console.log("hjgfd",event.target.value);
    
    this.filterBy.emit(event.target.value);
  } 
}
