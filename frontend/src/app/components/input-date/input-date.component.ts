import { ChangeDetectionStrategy, Component, computed, input, OnInit, signal } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-input-date',
  templateUrl: './input-date.component.html',
  styleUrls: ['./input-date.component.scss'],
  imports: [DatePickerModule, ReactiveFormsModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InputDateComponent {
  parentForm = input<FormGroup>(null);
  controlName = input<string>("");
  placeholder = input<string>("");
  labelText = input<string>("");
  errorText = input<string>("");
  size = input<string>("");
  icon = input<string>("pi pi-sort-down-fill");
  customStyle = input<string>("");
  disabled = input<boolean>(false);
  showIcon = input<boolean>(true);

  readonly selectValue = signal<any>(null);

  readonly hasValue = computed(() => {
    const v = this.selectValue();
    return v !== '' && v !== null && v !== undefined;
  });

  readonly inputClasses = computed(() => {
    const base = [this.size(), this.customStyle()].filter(Boolean).join(' ');
    return this.hasValue() ? `${base} dirty` : base;
  });
  get isRequired(): boolean {
    const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
    if (!ctrl) return false;
    if (typeof (ctrl as any).hasValidator === 'function') {
      return (ctrl as any).hasValidator(Validators.required);
    }
    return false;
  }

  onInput(event: any): void {
    const value = event;
    this.selectValue.set(value);
  }

  onClearClick(): void {
    this.selectValue.set(null);
  }
}
