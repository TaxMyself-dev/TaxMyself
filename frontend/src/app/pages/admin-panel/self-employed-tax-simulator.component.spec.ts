import { SelfEmployedTaxSimulatorComponent } from './self-employed-tax-simulator.component';

describe('SelfEmployedTaxSimulatorComponent', () => {
  let component: SelfEmployedTaxSimulatorComponent;

  beforeEach(() => {
    component = new SelfEmployedTaxSimulatorComponent();
  });

  it('calculates the approved annual example', () => {
    expect(component.businessProfit).toBe(90_000);
    expect(component.taxableIncome).toBe(186_000);
    expect(component.taxBeforeCredits).toBe(26_592);
    expect(component.creditReduction).toBe(6_534);
    expect(component.estimatedBalance).toBe(16_458);
    expect(component.currentBracketRate).toBe(20);
  });

  it('never reports a negative business profit or tax after credits', () => {
    component.businessRevenue = 10_000;
    component.businessExpenses = 30_000;
    component.salaryIncome = 0;
    component.creditPoints = 14;

    expect(component.businessProfit).toBe(0);
    expect(component.taxBeforeCredits).toBe(0);
    expect(component.taxAfterCredits).toBe(0);
  });

  it('shows a refund when withholding exceeds the annual tax', () => {
    component.businessRevenue = 0;
    component.businessExpenses = 0;
    component.salaryIncome = 84_000;
    component.creditPoints = 2.25;
    component.salaryTaxWithheld = 5_000;

    expect(component.estimatedBalance).toBeLessThan(0);
    expect(component.balanceLabel).toBe('החזר משוער');
  });
});
