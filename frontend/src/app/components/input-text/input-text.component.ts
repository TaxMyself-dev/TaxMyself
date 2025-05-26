import { ChangeDetectionStrategy, Component, EventEmitter, Input, input, OnInit, output } from '@angular/core';
import { AbstractControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { inputsSize } from 'src/app/shared/enums';
@Component({
  selector: 'app-input-text',
  templateUrl: './input-text.component.html',
  styleUrls: ['./input-text.component.scss'],
  imports: [FormsModule, ReactiveFormsModule, InputTextModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputTextComponent  implements OnInit {

  inputsSize = inputsSize;

  parentForm = input<FormGroup>(null);
  controlName = input<string>("");
  placeholder = input<string>("");
  errorText = input<string>("ערך לא תקין");
  labelText = input<string>("");
  ariaLabel = input<string>("");
  size = input<string>("");
  disabled = input<boolean>(false);
  type = input<'text' | 'number'>('text');
  onChangeInputText = output<string>();
  constructor() { }

  ngOnInit() {}

   /** true if this control was built with Validators.required */
   get isRequired(): boolean {
    const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
    if (!ctrl) return false;
    // Angular 16+ supports hasValidator
    if (typeof (ctrl as any).hasValidator === 'function') {
      return (ctrl as any).hasValidator(Validators.required);
    }
    // fallback: invoke validator() and look for a `required` key
    // if (ctrl.validator) {
    //   const errors = ctrl.validator(ctrl);
    //   return !!errors?.['required'];
    // }
    return false;
  }

  getinputClasses(): string {
    return [
      this.size(),             
    ]
      .filter(c => !!c)                // remove empty strings
      .join(' ');
  }

  onChange(event: any): void {
    this.onChangeInputText.emit(event.value);
  }

 

}
