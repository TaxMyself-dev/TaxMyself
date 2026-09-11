import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { SELF_EMPLOYED_GUIDE_FIGURES } from './self-employed-guide.figures';

@Component({
  selector: 'app-self-employed-tax-simulator',
  templateUrl: './self-employed-tax-simulator.component.html',
  styleUrls: ['./self-employed-tax-simulator.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class SelfEmployedTaxSimulatorComponent {
  readonly figures = SELF_EMPLOYED_GUIDE_FIGURES;
  readonly brackets = [...this.figures.incomeTaxBrackets].reverse();

  businessRevenue = 120_000;
  businessExpenses = 30_000;
  salaryIncome = 96_000;
  creditPoints = 2.25;
  salaryTaxWithheld = 3_600;

  get businessProfit(): number {
    return Math.max(0, this.businessRevenue - this.businessExpenses);
  }

  get taxableIncome(): number {
    return this.businessProfit + this.salaryIncome;
  }

  get taxBeforeCredits(): number {
    let tax = 0;
    let lowerBound = 0;

    for (const bracket of this.figures.incomeTaxBrackets) {
      const upperBound = bracket.upperBound ?? this.taxableIncome;
      const taxableInBracket = Math.max(0, Math.min(this.taxableIncome, upperBound) - lowerBound);
      tax += taxableInBracket * bracket.rate;

      if (bracket.upperBound === null || this.taxableIncome <= upperBound) {
        break;
      }

      lowerBound = upperBound;
    }

    return Math.round(tax);
  }

  get creditReduction(): number {
    return Math.min(this.taxBeforeCredits, Math.round(this.creditPoints * this.figures.annualCreditPointValue));
  }

  get taxAfterCredits(): number {
    return Math.max(0, this.taxBeforeCredits - this.creditReduction);
  }

  get estimatedBalance(): number {
    return this.taxAfterCredits - this.salaryTaxWithheld;
  }

  get balanceLabel(): string {
    return this.estimatedBalance >= 0 ? 'יתרה משוערת לתשלום' : 'החזר משוער';
  }

  get currentBracketRate(): number {
    const bracket = this.figures.incomeTaxBrackets.find(item => item.upperBound === null || this.taxableIncome <= item.upperBound);
    return Math.round((bracket?.rate ?? 0) * 100);
  }

  setBusinessRevenue(event: Event): void {
    this.businessRevenue = this.readRangeValue(event);
    this.businessExpenses = Math.min(this.businessExpenses, this.businessRevenue);
  }

  setBusinessExpenses(event: Event): void {
    this.businessExpenses = this.readRangeValue(event);
  }

  setSalaryIncome(event: Event): void {
    this.salaryIncome = this.readRangeValue(event);
  }

  setCreditPoints(event: Event): void {
    this.creditPoints = this.readRangeValue(event);
  }

  setSalaryTaxWithheld(event: Event): void {
    this.salaryTaxWithheld = this.readRangeValue(event);
  }

  formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('he-IL').format(Math.abs(Math.round(value)))} ₪`;
  }

  isCurrentBracket(rate: number): boolean {
    return Math.round(rate * 100) === this.currentBracketRate;
  }

  private readRangeValue(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }
}
