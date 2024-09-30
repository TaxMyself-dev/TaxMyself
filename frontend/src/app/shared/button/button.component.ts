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
  @Input() iconName: string;
  @Input() iconSrc: string;
  @Input() iconPosition = "start";
  @Input() ariaLabel: string;
  @Input() iconStyle: Partial<CSSStyleDeclaration> = {margin: '0'};
  @Input() buttonStyle: Partial<CSSStyleDeclaration> = {};
  @Input() href: string;

  @Output() onButtonClicked: EventEmitter<void> = new EventEmitter<void>();
  
  readonly ButtonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;

  constructor() {}

  onClick(): void {
    if (this.href) {
      window.open(this.href, '_blank'); // Handle navigation if href is provided
    } else {
      this.onButtonClicked.emit();
    }
  }
}
