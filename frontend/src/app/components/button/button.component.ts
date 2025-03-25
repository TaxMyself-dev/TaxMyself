import { Component, input, OnInit } from '@angular/core';
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
  // buttonSize = input<"small" | "big" | 'x_small'>('big');
  buttonSize = input<ButtonSize>(ButtonSize.BIG);
  buttonColor = input<string>();
  badge = input<string>(); // Number for notifications TODO: check if need pass string or number
  variant = input<"outlined" | "text">(null);
  isLoading = input<boolean>(false);
  disabled = input<boolean>(false);

  readonly ButtonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  
  
  constructor() { }
  
  ngOnInit() {}

  onClick(): void {

  }

  getButtonClasses(): string {
    const classes = {
      'x_small': this.buttonSize() === ButtonSize.X_SMALL,
      'small': this.buttonSize() === ButtonSize.SMALL,
      'big': this.buttonSize() === ButtonSize.BIG,
      'yellow': this.buttonColor() === ButtonColor.YELLOW,
      'black': this.buttonColor() === ButtonColor.BLACK
    };
  
    return Object.keys(classes).filter(className => classes[className]).join(' ');
  }
  

}
