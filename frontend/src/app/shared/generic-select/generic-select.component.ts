import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-generic-select',
  templateUrl: './generic-select.component.html',
  styleUrls: ['./generic-select.component.scss', '../shared-styling.scss'],
})
export class GenericSelectComponent {

  constructor() { }
  
  @Input() items: ({value: string | number | boolean; name: string | number;})[];
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
