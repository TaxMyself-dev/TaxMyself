import { Component, computed, EventEmitter, input, OnInit, Output, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ButtonColor, ButtonSize, iconPosition } from './button.enum';

@Component({
  selector: 'app-p-button',
  standalone: true,
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  imports: [CommonModule, ButtonModule],
})
export class ButtonComponent  implements OnInit {
  icon = input<string>();
  iconPosition = input<iconPosition>(iconPosition.LEFT);
  iconOnly = input<boolean>(false); //For aria-label for accessibility
  buttonText = input<string>('Button');
  buttonSize = input<ButtonSize>(ButtonSize.BIG);
  buttonColor = input<ButtonColor>(ButtonColor.BLACK);
  severity = input<"success" | "info" | "warn" | "danger" | "help" | "primary" | "secondary" | "contrast">();
  badge = input<string>(); // Number for notifications TODO: check if need pass string or number
  variant = input<"outlined" | "text">(null);
  isLoading = input<boolean>(false);
  disabled = input<boolean>(false);

  buttonClasses: Signal<string> = computed(() => {
    return [
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
    this.onButtonClicked.emit(event);
  }

}
