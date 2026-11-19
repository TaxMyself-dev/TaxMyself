import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { InputSelectComponent } from '../../components/input-select/input-select.component';
import { ISelectItem } from '../../shared/interface';

/** Adapts existing signal-based editor values to the shared searchable select. */
@Component({
  selector: 'app-settings-new-select', standalone: true, imports: [InputSelectComponent],
  template: `<app-input-select [parentForm]="form" controlName="value" [items]="options"
    [placeholder]="placeholder" [ariaLabel]="placeholder" [filter]="true" [showClear]="false"
    (onChangeInputSelect)="changed($event)" />`,
  styles: [`:host {display:block; min-width:0; width:100%;}
    :host ::ng-deep .input-select-wrapper, :host ::ng-deep .p-select {width:100%; min-width:0;}
    :host ::ng-deep .p-select {border:1px solid #ebebeb; border-radius:30px; font:inherit; color:#363636;}
  `],
})
export class SettingsNewSelectComponent implements OnChanges {
  @Input() items: Array<{name?: string | number; label?: string; value: any}> = [];
  @Input() value: any = null;
  @Input() placeholder = 'בחר/י אפשרות';
  @Output() valueChange = new EventEmitter<any>();
  readonly form = new FormGroup({value: new FormControl<any>(null)});
  options: ISelectItem[] = [];
  ngOnChanges(): void {
    this.options = this.items.map(item => ({name: item.name ?? item.label ?? '', value: item.value}));
    this.form.patchValue({value: this.value});
  }
  changed(value: string | boolean): void { this.valueChange.emit(value); }
}
