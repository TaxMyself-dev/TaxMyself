import { ChangeDetectionStrategy, Component, computed, effect, inject, Injector, input, OnInit, output, signal } from '@angular/core';
import { AbstractControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { ButtonComponent } from "../button/button.component";
import { ButtonSize } from '../button/button.enum';
@Component({
  selector: 'app-input-select',
  templateUrl: './input-select.component.html',
  styleUrls: ['./input-select.component.scss'],
  imports: [SelectModule, FormsModule,
    ReactiveFormsModule, ButtonComponent, MultiSelectModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputSelectComponent implements OnInit {
  private injector = inject(Injector);

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

  onChangeInputSelect = output<string | boolean>();
  onClickInputSelect = output<string>();
  multiSelectButtonClicked = output<any>();
  addSubCategoryClicked = output<{ state: true, subCategoryMode: true }>();


  stringMessage = signal<string>("");

  readonly selectValue = signal<any>(null);

  readonly hasValue = computed(() => {
    const v = this.selectValue();
    return v !== '' && v !== null && v !== undefined;
  });

  readonly inputClasses = computed(() => {
    const base = [this.size(), this.customStyle()].filter(Boolean).join(' ');
    return this.hasValue() ? `${base} dirty` : base;
  });

  ngOnInit() {
    this.getStringMessage();

    effect(() => {
      const form = this.parentForm();
      const name = this.controlName();
      const isDisabled = this.disabled();

      if (!form || !name) return;
      const ctrl = form.get(name);
      if (!ctrl) return;

      if (isDisabled && ctrl.enabled) {
        ctrl.disable({ emitEvent: false });
      } else if (!isDisabled && ctrl.disabled) {
        ctrl.enable({ emitEvent: false });
      }
    }, { injector: this.injector });

  }

  get isRequired(): boolean {
    const ctrl: AbstractControl | null = this.parentForm()?.get(this.controlName());
    if (!ctrl) return false;
    if (typeof (ctrl as any).hasValidator === 'function') {
      return (ctrl as any).hasValidator(Validators.required);
    }
    return false;
  }

  getStringMessage(): void {
    const selectedItems: ISelectItem[] = this.parentForm()?.get(this.controlName())?.value || [];
    if (Array.isArray(selectedItems)) {
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
  }

  onChange(event: any): void {
    this.getStringMessage();

    const value = event?.value;
    this.selectValue.set(value);

    this.onChangeInputSelect.emit(value);
  }

  onAddSubCategoryClicked(): void {
    this.addSubCategoryClicked.emit({ state: true, subCategoryMode: true, })
  }

  onMultiSelectButtonClicked(event: any): void {
    // this.multiSelectButtonClicked.emit(event);
    event.hide();
  }





}
