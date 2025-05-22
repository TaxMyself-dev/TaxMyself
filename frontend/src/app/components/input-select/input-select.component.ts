import { ChangeDetectionStrategy, Component, OnInit, input, output, signal, WritableSignal } from '@angular/core';
import { AbstractControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { tr } from 'date-fns/locale';
import { SelectModule } from 'primeng/select';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { ButtonComponent } from "../button/button.component";
import { ButtonSize } from '../button/button.enum';
import { MultiSelectModule } from 'primeng/multiselect';
@Component({
  selector: 'app-input-select',
  templateUrl: './input-select.component.html',
  styleUrls: ['./input-select.component.scss'],
  imports: [SelectModule, FormsModule,
    ReactiveFormsModule, ButtonComponent, MultiSelectModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputSelectComponent  implements OnInit {

  inputsSize = inputsSize;
  buttonSize = ButtonSize;
  

  parentForm = input<FormGroup>(null);
  items = input<ISelectItem[] | { label: string; items: ISelectItem[]; }[]>([]);
  controlName = input<string>("");
  placeholder = input<string>("");
  labelText = input<string>("");
  errorText = input<string>("");
  size = input<string>("");
  filter = input<boolean>(true);
  multiSelect = input<boolean>(false);
  isSubCategory = input<boolean>(false);
  disabled = input<boolean>(false);
  group = input<boolean>(false);
  virtualScroll = input<boolean>(false);
  ariaLabel = input<string>("");
  onChangeInputSelect = output<string>();
  onClickInputSelect = output<string>();
  multiSelectButtonClicked = output<string>();
  addSubCategoryClicked = output<{ state: true, subCategoryMode: true }>();





  constructor() {}

  ngOnInit() {}

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
    console.log("🚀 ~ InputSelectComponent ~ onChange ~ event:", event)
    this.onChangeInputSelect.emit(event.value);
  }

  onClick(event: any): void {
    console.log("🚀 ~ InputSelectComponent ~ onClick ~ event:", event)
    event.stopPropagation();
    this.onClickInputSelect.emit(event);
  }
  onAddSubCategoryClicked(): void {
    console.log("🚀 ~ InputSelectComponent ~ onAddSubCategoryClicked ~ event:", this.isSubCategory());
    
    this.addSubCategoryClicked.emit({ state: true, subCategoryMode: true, })
  }

  onMultiSelectButtonClicked(): void {
    this.multiSelectButtonClicked.emit("");
  }



 

}
