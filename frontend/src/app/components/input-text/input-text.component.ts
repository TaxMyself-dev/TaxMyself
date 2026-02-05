import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { AbstractControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { FormType, inputsSize } from 'src/app/shared/enums';
@Component({
  selector: 'app-input-text',
  templateUrl: './input-text.component.html',
  styleUrls: ['./input-text.component.scss'],
  imports: [FormsModule, ReactiveFormsModule, InputTextModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputTextComponent {

  inputsSize = inputsSize;

  parentForm = input<FormGroup>(null);
  controlName = input<string>("");
  placeholder = input<string>("");
  errorText = input<string>("ערך לא תקין");
  labelText = input<string>("");
  ariaLabel = input<string>("");
  size = input<string>("");
  customStyle = input<string>("");
  value = input<string>("");
  min = input<number>(null);
  max = input<number>(null);
  disabled = input<boolean>(false);
  type = input<FormType>('text');
  onInputText = output<string>();

  readonly inputValue = signal<string>('');


  readonly inputClasses = computed(() => {
    const base = [this.size(), this.customStyle()].filter(Boolean).join(' ');
    return this.isDirty() ? `${base} dirty` : base;
  });

  readonly isDirty = computed(() => {
    const ctrl = this.parentForm()?.get(this.controlName());
    const hasValue = (this.inputValue().trim() !== '');
    return !!ctrl?.dirty && hasValue;
  });

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

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.inputValue.set(value);
    this.onInputText.emit(value);
  }

}
