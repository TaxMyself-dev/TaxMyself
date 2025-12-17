import { ChangeDetectionStrategy, Component, input, OnInit, output, signal, computed } from '@angular/core';
import { AbstractControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { inputsSize } from 'src/app/shared/enums';

interface AutoCompleteCompleteEvent {
  originalEvent: Event;
  query: string;
}

@Component({
  selector: 'app-input-autocomplete',
  templateUrl: './input-autoComplete.component.html',
  styleUrls: ['./input-autoComplete.component.scss'],
  imports: [FormsModule, ReactiveFormsModule, AutoCompleteModule, ButtonModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputAutoCompleteComponent implements OnInit {

  inputsSize = inputsSize;

  // Input signals
  parentForm = input<FormGroup>(null);
  controlName = input<string>("");
  placeholder = input<string>("");
  errorText = input<string>("ערך לא תקין");
  labelText = input<string>("");
  size = input<string>("");
  customStyle = input<string>("");
  disabled = input<boolean>(false);
  items = input<any[]>([]);
  optionLabel = input<string>('name');
  dropdown = input<boolean>(true);
  forceSelection = input<boolean>(false);
  showAddNew = input<boolean>(false);
  addNewLabel = input<string>('+ הוסף חדש');
  headerText = input<string>('');

  // Output signals
  onCompleteMethod = output<AutoCompleteCompleteEvent>();
  onItemSelect = output<any>();
  onAddNew = output<string>();

  // State signals
  filteredItems = signal<any[]>([]);
  inputClasses = signal<string>("");

  constructor() { }

  ngOnInit() {
    this.getInputClasses();
    // Initialize filtered items with all items
    this.filteredItems.set(this.items());
  }

  getInputClasses(): void {
    const classes = [
      this.size(),   
      this.customStyle()
    ]
      .filter(c => !!c)
      .join(' ');
            
    this.inputClasses.set(classes);
  }

  onComplete(event: AutoCompleteCompleteEvent): void {
    // Emit to parent for custom filtering
    this.onCompleteMethod.emit(event);
  }

  onSelect(event: any): void {
    this.onItemSelect.emit(event);
  }

  handleAddNew(query: string): void {
    this.onAddNew.emit(query);
  }

  /** true if this control was built with Validators.required */
  get isRequired(): boolean {
    const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
    if (!ctrl) return false;
    // Angular 16+ supports hasValidator
    if (typeof (ctrl as any).hasValidator === 'function') {
      return (ctrl as any).hasValidator(Validators.required);
    }
    return false;
  }

}
