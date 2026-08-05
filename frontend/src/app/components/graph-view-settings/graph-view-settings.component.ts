import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CheckboxModule } from 'primeng/checkbox';

@Component({
  selector: 'app-graph-view-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CheckboxModule],
  templateUrl: './graph-view-settings.component.html',
  styleUrl: './graph-view-settings.component.scss',
})
export class GraphViewSettingsComponent {
  chartType    = input.required<'line' | 'bar'>();
  showExpenses = input.required<boolean>();
  showIncomes  = input.required<boolean>();

  chartTypeChange    = output<'line' | 'bar'>();
  showExpensesChange = output<boolean>();
  showIncomesChange  = output<boolean>();

  readonly _showExpensesCtrl = new FormControl<boolean>(true, { nonNullable: true });
  readonly _showIncomesCtrl  = new FormControl<boolean>(true, { nonNullable: true });

  constructor() {
    effect(() => {
      const v = this.showExpenses();
      if (this._showExpensesCtrl.value !== v) this._showExpensesCtrl.setValue(v, { emitEvent: false });
    });
    effect(() => {
      const v = this.showIncomes();
      if (this._showIncomesCtrl.value !== v) this._showIncomesCtrl.setValue(v, { emitEvent: false });
    });

    // Constraint: both series cannot be unchecked simultaneously
    this._showExpensesCtrl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(v => {
        if (!v && !this._showIncomesCtrl.value) {
          this._showExpensesCtrl.setValue(true, { emitEvent: false });
          return;
        }
        this.showExpensesChange.emit(v);
      });

    this._showIncomesCtrl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(v => {
        if (!v && !this._showExpensesCtrl.value) {
          this._showIncomesCtrl.setValue(true, { emitEvent: false });
          return;
        }
        this.showIncomesChange.emit(v);
      });
  }

  selectChartType(type: 'line' | 'bar'): void {
    if (type === this.chartType()) return;
    this.chartTypeChange.emit(type);
  }
}
