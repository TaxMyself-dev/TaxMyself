import { Component, EventEmitter, input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ButtonModule } from 'primeng/button';
import { ButtonColor, ButtonSize } from './button.enum';

@Component({
  selector: 'app-p-button',
  standalone: true,
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  imports: [CommonModule, ButtonModule],
})
export class ButtonComponent  implements OnInit {
  icon = input<string>();
  iconPosition = input<string>();
  iconOnly = input<boolean>(false); //For aria-label for accessibility
  buttonText = input<string>('Button');
  buttonSize = input<ButtonSize>(ButtonSize.BIG);
  buttonColor = input<ButtonColor>(ButtonColor.BLACK);
  severity = input<"success" | "info" | "warn" | "danger" | "help" | "primary" | "secondary" | "contrast">();
  badge = input<string>(); // Number for notifications TODO: check if need pass string or number
  variant = input<"outlined" | "text">(null);
  isLoading = input<boolean>(false);
  disabled = input<boolean>(false);

  @Output() onButtonClicked = new EventEmitter<Event>();

  
  readonly ButtonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  
  
  constructor() { }
  
  ngOnInit() {
  }
  
  onClick(event: Event): void {
    this.onButtonClicked.emit(event);
  }

  getButtonClasses(): string {
    const classes = {
      'x_small': this.buttonSize() === ButtonSize.X_SMALL,
      'small': this.buttonSize() === ButtonSize.SMALL,
      'big': this.buttonSize() === ButtonSize.BIG,
      'yellow': this.buttonColor() === ButtonColor.YELLOW,
      'black': this.buttonColor() === ButtonColor.BLACK,
      'white': this.buttonColor() === ButtonColor.WHITE,
      'outlined': this.variant() === 'outlined',
    };
  
    return Object.keys(classes).filter(className => classes[className]).join(' ');
  }
  

}
