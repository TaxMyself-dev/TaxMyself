import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { receiptOutline, calculatorOutline, shieldCheckmarkOutline, gitBranchOutline, addCircleOutline } from 'ionicons/icons';
import { calculateExpenseSavings, ExpenseBusinessType, EXPENSE_VAT_RATE } from './guide-expense-savings';

@Component({
  selector: 'app-guide-expense-savings', standalone: true,
  imports: [CommonModule],
  templateUrl: './guide-expense-savings.component.html',
  styleUrls: ['./guide-expense-savings.component.scss'],
})
export class GuideExpenseSavingsComponent {
  readonly icons = Object.fromEntries(Object.entries({
    receipt: receiptOutline, tax: calculatorOutline,
    insurance: shieldCheckmarkOutline, branch: gitBranchOutline, add: addCircleOutline,
  }).map(([key, uri]) => [key,
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      decodeURIComponent(uri.slice(uri.indexOf(',') + 1))
        .replace('<svg ', '<svg fill="none" stroke="#286861" stroke-width="32" ')
        .replace(/currentColor/g, '#286861'),
    ),
  ]));
  @Input() mode: 'principle' | 'calculator' = 'calculator';
  businessType: ExpenseBusinessType = 'authorized';
  expenses = 11800;
  taxPercent = 20;
  insurancePercent = 18;
  vatEligible = true;
  lastSaving: number | null = null;
  readonly vatPercent = EXPENSE_VAT_RATE * 100;
  get result() { return calculateExpenseSavings(this); }
  money(n: number): string { return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n) + ' ₪'; }
  change(field: 'expenses' | 'taxPercent' | 'insurancePercent', event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const max = field === 'expenses' ? 100000 : field === 'taxPercent' ? 50 : 18;
    this[field] = Number.isFinite(raw) ? Math.min(max, Math.max(0, raw)) : 0;
    this.lastSaving = null;
  }
  selectBusiness(type: ExpenseBusinessType): void { this.businessType = type; this.lastSaving = null; }
  toggleVat(event: Event): void { this.vatEligible = (event.target as HTMLInputElement).checked; this.lastSaving = null; }
  addExpense(): void {
    const before = this.result.total;
    this.expenses = Math.min(100000, this.expenses + 1180);
    this.lastSaving = this.result.total - before;
  }
}
