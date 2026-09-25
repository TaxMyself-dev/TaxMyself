import { TestBed } from '@angular/core/testing';
import { GuideExpenseSavingsComponent } from './guide-expense-savings.component';
describe('Expense savings slide controls', () => {
  it('updates results from actual controls and shows the added-expense saving', async () => {
    await TestBed.configureTestingModule({imports:[GuideExpenseSavingsComponent]}).compileComponents();
    const f=TestBed.createComponent(GuideExpenseSavingsComponent); f.detectChanges();
    const root: HTMLElement=f.nativeElement;
    expect(root.querySelector('input[aria-label="הכנסות שנתיות"]')).toBeNull();
    expect(root.querySelector('h2')!.textContent).toContain('באמת שווה לכם');
    expect(root.textContent).not.toContain('רווח לפני');
    const expenses=root.querySelector<HTMLInputElement>('input[aria-label="הוצאות ששולמו"]')!;
    expenses.value='1180'; expenses.dispatchEvent(new Event('input')); f.detectChanges();
    expect(f.componentInstance.result.total).toBeCloseTo(560,6);
    root.querySelector<HTMLButtonElement>('.add-expense')!.click(); f.detectChanges();
    expect(f.componentInstance.lastSaving).toBeCloseTo(560,6);
    root.querySelector<HTMLButtonElement>('.business-picker button')!.click(); f.detectChanges();
    expect(f.componentInstance.result.vat).toBe(0);
    expect(root.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBeTrue();
    f.destroy();
  });
  it('clears stale deltas after parameter changes and caps added expenses', () => {
    const c=new GuideExpenseSavingsComponent(); c.addExpense(); c.selectBusiness('exempt');
    expect(c.lastSaving).toBeNull(); c.expenses=99999; c.addExpense(); expect(c.expenses).toBe(100000);
  });
});
