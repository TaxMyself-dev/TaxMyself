import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputDateComponent } from '../../components/input-date/input-date.component';

export interface SettingsField {
  key: string;
  label: string;
  type?: string;
  options?: { name: string | number; value: any }[];
}

@Component({
  selector: 'app-new-settings-field', standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputDateComponent],
  template: `
    <div class="field" [formGroup]="group">
      @if (readonly) {
        <span class="label">{{ field.label }}</span>
        <span class="value">{{ displayValue() }}</span>
      } @else if (field.type === 'date') {
        <app-input-date [parentForm]="group" [controlName]="field.key"
          [labelText]="field.label" placeholder="dd/mm/yyyy" size="new-settings-date" />
      } @else {
        <label [for]="uid">{{ field.label }}</label>
        @if (field.options) {
          <select [id]="uid" [formControlName]="field.key" (change)="valueChanged.emit()">
            <option [ngValue]="''" disabled>בחרו...</option>
            @for (option of field.options; track $index) {
              <option [ngValue]="option.value">{{ option.name }}</option>
            }
          </select>
        } @else {
          <input [id]="uid" [type]="field.type || 'text'" [formControlName]="field.key"
            [placeholder]="'הזן ' + field.label + '...'" [attr.min]="field.type === 'number' ? 0 : null"
            [attr.max]="field.type === 'number' ? 100 : null" />
        }
      }
      @if (!readonly && group.get(field.key)?.invalid && group.get(field.key)?.touched) {
        <small role="alert">{{ group.get(field.key)?.hasError('required') ? 'שדה חובה' : 'יש להזין ערך תקין' }}</small>
      }
    </div>`,
  styles: [`
    :host { display:block; min-width:0; }
    .field { display:flex; flex-direction:column; min-width:0; gap:4px; }
    label,.label { font-size:16px; line-height:19px; color:var(--new-text); }
    input,select { font:inherit; color:var(--new-text); background:white; min-width:0; width:100%; height:39px; outline:none; padding:9px 2px; border:0; border-bottom:1px solid var(--new-stroke); border-radius:0; }
    select { border:1px solid var(--new-stroke); border-radius:30px; padding:8px 12px; }
    input::placeholder { color:var(--new-muted); }
    input:focus,select:focus { border-color:var(--new-text); box-shadow:0 1px var(--new-text); }
    input[type=email],input[type=tel] { direction:ltr; text-align:right; }
    .value { min-height:39px; padding-top:10px; overflow-wrap:anywhere; }
    small { color:#a12626; font-size:13px; }
    :host ::ng-deep app-input-date .input-text-wrapper { width:100%; gap:4px; }
    :host ::ng-deep app-input-date .input-label { margin:0; font-size:16px; font-weight:400; }
    :host ::ng-deep app-input-date p-datepicker,:host ::ng-deep app-input-date .p-datepicker { width:100%; }
    :host ::ng-deep app-input-date input { width:100%!important; min-width:0!important; height:39px!important; border:1px solid var(--new-stroke)!important; border-radius:30px!important; padding:8px 12px!important; font:inherit!important; box-shadow:none!important; }
  `]
})
export class SettingsNewFieldComponent {
  private static nextId = 0;
  readonly uid = `new-settings-field-${SettingsNewFieldComponent.nextId++}`;
  @Input({ required: true }) group!: FormGroup;
  @Input({ required: true }) field!: SettingsField;
  @Input() readonly = false;
  @Output() valueChanged = new EventEmitter<void>();
  displayValue(): string {
    const value = this.group.get(this.field.key)?.value;
    if (value === null || value === undefined || value === '') return '—';
    if (value instanceof Date) return value.toLocaleDateString('he-IL');
    return String(this.field.options?.find(option => option.value === value)?.name ?? value);
  }
}
