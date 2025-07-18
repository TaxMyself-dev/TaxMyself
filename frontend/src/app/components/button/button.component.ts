import { Component, computed, EventEmitter, Input, input, OnInit, Output, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ButtonColor, ButtonSize, iconPosition } from './button.enum';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-p-button',
  standalone: true,
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  imports: [CommonModule, ButtonModule, RouterModule],
})
export class ButtonComponent  implements OnInit {
  icon = input<string>();
  link = input<string>(null);
  iconPosition = input<iconPosition>(iconPosition.LEFT);
  iconOnly = input<boolean>(false); //For aria-label for accessibility
  raised = input<boolean>(false); // For mark the button
  buttonText = input<string>('Button');
  //@Input() buttonText: string = 'Button';
  class = input<string>('');
  buttonSize = input<ButtonSize>(ButtonSize.BIG);
  buttonColor = input<ButtonColor>();
  severity = input<"success" | "info" | "warn" | "danger" | "help" | "primary" | "secondary" | "contrast">();
  badge = input<string>(); // Number for notifications TODO: check if need pass string or number
  variant = input<"outlined" | "text">(null);
  href = input<string>(null);
  isLoading = input<boolean>(false);
  disabled = input<boolean>(false);

  buttonClasses: Signal<string> = computed(() => {
    return [
      this.class(),                                      // custom class
      this.buttonSize(),                                 
      this.buttonColor(),                                
      this.variant() === 'outlined' ? 'outlined' : '',   // include 'outlined' if set
      this.variant() === 'text' ? 'text' : '',   // include 'text' if set
      this.disabled() ? 'disabled' : ''                  // include 'disabled' if set
    ]
    .filter(c => !!c)                                    // drop empty strings
    .join(' ');
  });

  @Output() onButtonClicked = new EventEmitter<Event>();

  
  readonly ButtonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  
  constructor() { }
  
  ngOnInit() {
  }
  
  onClick(event: Event): void {
    if (this.href()) {
      window.open(this.href(), '_blank'); // Handle navigation if href is provided
    } else {
      this.onButtonClicked.emit(event);
    }
  }

}
