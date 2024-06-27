import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-generic-select',
  templateUrl: './generic-select.component.html',
  styleUrls: ['./generic-select.component.scss'],
})
export class GenericSelectComponent {

  constructor() { }
  
  @Input() items: ({value: string | number; name: string | number;})[];
  @Input() title: string;
  @Input() isRequired: boolean = false;
  @Input() parentForm: FormGroup;
  @Input() controlName: string;

  @Output() selectionChanged = new EventEmitter<number>();

  onSelectChange(event: any): void {
    console.log(event.target);
    
    this.selectionChanged.emit(event.target);
  }
}
