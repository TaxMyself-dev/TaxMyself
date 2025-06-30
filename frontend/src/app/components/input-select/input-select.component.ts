import { ChangeDetectionStrategy, Component, OnInit, input, output, signal, WritableSignal, computed, Signal } from '@angular/core';
import { AbstractControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
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
  virtualScrollItemSize = input<string>("38");
  placeholder = input<string>("");
  labelText = input<string>("");
  errorText = input<string>("");
  size = input<string>("");
  customStyle = input<string>("");
  icon = input<string>("pi pi-sort-down-fill");
  filter = input<boolean>(true);
  multiSelect = input<boolean>(false);
  isSubCategory = input<boolean>(false);
  disabled = input<boolean>(false);
  group = input<boolean>(false);
  virtualScroll = input<boolean>(false);
  ariaLabel = input<string>("");
  onChangeInputSelect = output<string>();
  onClickInputSelect = output<string>();
  multiSelectButtonClicked = output<any>();
  addSubCategoryClicked = output<{ state: true, subCategoryMode: true }>();
  inputClasses = signal<string>("");
  stringMessage = signal<string>("");


  // selectedItemsLabel = coed(() => {
  //   const selected = this.selectedItemsSignal();
  //   console.log("🚀 ~ InputSelectComponent ~ selectedItemsLabel=computed ~ selected :", selected )
  //   const allItems = this.items() || [];
  
  //   if (selected.length === allItems.length && allItems.length > 0) {
  //     return 'כל האפשרויות נבחרו';
  //   }
  
  //   return `נבחרו ${selected.length}`;
  // });


  constructor() {}

  ngOnInit() {
    this.getinputClasses();
    this.getStringMessage();
  }

  get isRequired(): boolean {
    const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
    if (!ctrl) return false;
    if (typeof (ctrl as any).hasValidator === 'function') {
      return (ctrl as any).hasValidator(Validators.required);
    }
    return false;
  }

  // getStringMessage(): void {
  //   const selectedItems = this.parentForm()?.get(this.controlName())?.value || [];
  //   console.log("🚀 ~ InputSelectComponent ~ ngOnInit ~ selectedItems:", selectedItems)
  //   const allItems = this.items() || [];
  //   console.log("🚀 ~ InputSelectComponent ~ ngOnInit ~ allItems:", allItems)
  
  //   if (selectedItems.length === allItems.length && allItems.length > 0) {
  //     this.stringMessage.set( 'כל האפשרויות נבחרו');
  //   }
  //   else {
  //     this.stringMessage.set( `נבחרו ${selectedItems.length}`);
  //   }
  // }

  getStringMessage(): void {
    const selectedItems: ISelectItem[] = this.parentForm()?.get(this.controlName())?.value || [];
    const allItems = this.items() || [];
  
    if (selectedItems.length === allItems.length && allItems.length > 0) {
      this.stringMessage.set('כל האפשרויות נבחרו');
    }
    else if (selectedItems.length <= 3) {
      const names = selectedItems.map(item => item.name).join(', ');
      this.stringMessage.set(names);
    }
    else {
      this.stringMessage.set(`נבחרו ${selectedItems.length}`);
    }
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

  onChange(event: any): void {
    this.getStringMessage();
      const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
        if (ctrl.value != "" && ctrl.value != null && ctrl.value != undefined) {
          this.inputClasses.update(current => current + ' dirty');
        }
        else {
          this.inputClasses.update(current => current.replace('dirty', ''));
        }
    this.onChangeInputSelect.emit(event.value);
  }

  onClick(event: any): void {
    event.stopPropagation();
    this.onClickInputSelect.emit(event);
  }

  onAddSubCategoryClicked(): void {
    this.addSubCategoryClicked.emit({ state: true, subCategoryMode: true, })
  }

  onMultiSelectButtonClicked(event: any): void {
    // this.multiSelectButtonClicked.emit(event);
    event.hide();
  }



 

}
