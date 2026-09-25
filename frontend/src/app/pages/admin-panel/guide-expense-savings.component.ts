import { CommonModule } from '@angular/common';
import { Component, Input, ElementRef, ViewChild } from '@angular/core';
import { receiptOutline, calculatorOutline, shieldCheckmarkOutline, gitBranchOutline, addCircleOutline } from 'ionicons/icons';
import { calculateExpenseSavings, ExpenseBusinessType, ExpenseSavingsItem } from './guide-expense-savings';

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
  items: ExpenseSavingsItem[] = [{ amount: 11800, taxRecognition: 100, vatRecognition: 100 }];
  draft: ExpenseSavingsItem = { amount: 1180, taxRecognition: 100, vatRecognition: 100 };
  addingExpense = false;
  draftError = '';
  @ViewChild('amountInput') set amountInput(input: ElementRef<HTMLInputElement> | undefined) {
    input?.nativeElement.focus();
  }
  @ViewChild('addButton') addButton?: ElementRef<HTMLButtonElement>;
  get scaledItems(): ExpenseSavingsItem[] {
    const total = this.items.reduce((sum, item) => sum + item.amount, 0);
    return this.items.map(item => ({ ...item, amount: total ? item.amount * this.expenses / total : 0 }));
  }
  get result() { return calculateExpenseSavings({ ...this, items: this.scaledItems }); }
  money(n: number): string { return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n) + ' ₪'; }
  change(field: 'expenses' | 'taxPercent' | 'insurancePercent', event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const max = field === 'expenses' ? 100000 : field === 'taxPercent' ? 50 : 18;
    this[field] = Number.isFinite(raw) ? Math.min(max, Math.max(0, raw)) : 0;
    this.lastSaving = null;
  }
  selectBusiness(type: ExpenseBusinessType): void { this.businessType = type; this.lastSaving = null; }
  openExpense(): void {
    this.draft = { amount: Math.min(1180, 100000 - this.expenses), taxRecognition: 100,
      vatRecognition: this.businessType === 'authorized' ? 100 : 0 };
    this.draftError = '';
    this.addingExpense = true;
  }
  changeDraft(field: keyof ExpenseSavingsItem, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.draft[field] = raw.trim() ? Number(raw) : NaN;
    this.draftError = '';
  }
  cancelExpense(): void {
    this.addingExpense = false;
    this.addButton?.nativeElement.focus();
  }
  addExpense(): void {
    const { amount, taxRecognition, vatRecognition } = this.draft;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 - this.expenses) {
      this.draftError = 'הזינו סכום חיובי, עד ' + this.money(100000 - this.expenses);
      return;
    }
    if (![taxRecognition, vatRecognition].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) {
      this.draftError = 'אחוזי ההכרה צריכים להיות בין 0 ל־100.';
      return;
    }
    const before = this.result.total;
    this.items = [...this.scaledItems.filter(item => item.amount > 0), { ...this.draft }];
    this.expenses = Math.round((this.expenses + amount) * 100) / 100;
    this.lastSaving = this.result.total - before;
    this.cancelExpense();
  }
}
