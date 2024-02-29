import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ButtonClass } from './button.enum';

@Component({
  selector: 'app-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {

  @Input() buttonText: string = '';
  @Input() disabled: boolean = false;
  @Input() buttonClass: string = ButtonClass.PRIMARY;

  @Output() onButtonClicked: EventEmitter<void> = new EventEmitter<void>();
  
  constructor() {}

  onClick(): void {
    this.onButtonClicked.emit();
  }
}
