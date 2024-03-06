import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ButtonClass, ButtonSize } from './button.enum';

@Component({
  selector: 'app-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {

  @Input() buttonText: string = '';
  @Input() disabled: boolean = false;
  @Input() buttonClass: string = ButtonClass.PRIMARY;
  @Input() buttonSize: string = ButtonSize.BIG;
  @Input() buttonStyle: Partial<CSSStyleDeclaration> = {}

  @Output() onButtonClicked: EventEmitter<void> = new EventEmitter<void>();
  
  readonly ButtonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;

  constructor() {}

  onClick(): void {
    this.onButtonClicked.emit();
  }
}
