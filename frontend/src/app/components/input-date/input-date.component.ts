import { ChangeDetectionStrategy, Component, input, OnInit, signal } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { get } from 'http';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-input-date',
  templateUrl: './input-date.component.html',
  styleUrls: ['./input-date.component.scss'],
  imports: [DatePickerModule, ReactiveFormsModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InputDateComponent implements OnInit {
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
  inputClasses = signal<string>("");

  // style = signal<{}>({});

  constructor() { }

  ngOnInit() {}

  ngAfterViewInit(): void {
    this.getinputClasses();
  }

  get isRequired(): boolean {
    const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
    if (!ctrl) return false;
    if (typeof (ctrl as any).hasValidator === 'function') {
      return (ctrl as any).hasValidator(Validators.required);
    }
    return false;
  }

  getinputClasses(): void {
    const classes = [
      this.size(),
      this.customStyle()
    ]
      .filter(c => !!c)                // remove empty strings
      .join(' ');

    this.inputClasses.set(classes);
  }

  onInput(): void {
    const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
    if (ctrl.value != "" && ctrl.value != null && ctrl.value != undefined) {
      this.inputClasses.update(current => current + ' dirty');
    }
    else {
      this.inputClasses.update(current => current.replace('dirty', ''));
    }
    // this.onInputText.emit(event.target.value);
  }


}
