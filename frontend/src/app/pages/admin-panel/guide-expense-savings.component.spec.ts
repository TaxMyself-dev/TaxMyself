import { TestBed } from '@angular/core/testing';
import { GuideExpenseSavingsComponent } from './guide-expense-savings.component';
describe('Expense savings slide controls', () => {
  it('adds an expense with separate recognition rates and updates the slider', async () => {
    await TestBed.configureTestingModule({imports:[GuideExpenseSavingsComponent]}).compileComponents();
    const f=TestBed.createComponent(GuideExpenseSavingsComponent); f.detectChanges();
    const root: HTMLElement=f.nativeElement;
    const set=(label:string, value:string) => {
      const input=root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      input.value=value; input.dispatchEvent(new Event('input')); f.detectChanges();
    };
    expect(root.querySelector('.eyebrow')).toBeNull();
    expect(root.querySelector('.model-note')).toBeNull();
    expect(root.querySelector('.fine-print')).toBeNull();
    set('הוצאות ששולמו','0');
    root.querySelector<HTMLButtonElement>('.add-expense')!.click(); f.detectChanges();
    set('סכום ההוצאה','1180'); set('אחוז מוכר למס','50'); set('אחוז מוכר למעמ','50');
    root.querySelector('form')!.dispatchEvent(new Event('submit', {cancelable:true})); f.detectChanges();
    const c=f.componentInstance;
    expect(c.result.vat).toBeCloseTo(90,6); expect(c.result.deductible).toBeCloseTo(545,6);
    expect(c.result.tax).toBeCloseTo(109,6); expect(c.result.insurance).toBeCloseTo(98.1,6);
    expect(c.lastSaving).toBeCloseTo(297.1,6);
    expect(root.querySelector<HTMLInputElement>('input[type=range]')!.value).toBe('1180');
    expect(root.querySelector('.live-paper')!.textContent).toContain('חיסכון במע״מ');
    expect(root.querySelector('form')).toBeNull();
    set('הוצאות ששולמו','2360');
    expect(c.result.total).toBeCloseTo(594.2,6); expect(c.lastSaving).toBeNull();
    root.querySelector<HTMLButtonElement>('.business-picker button')!.click(); f.detectChanges();
    expect(c.result.vat).toBe(0);
    root.querySelector<HTMLButtonElement>('.add-expense')!.click(); f.detectChanges();
    expect(root.querySelector<HTMLInputElement>('input[aria-label="אחוז מוכר למעמ"]')!.disabled).toBeTrue();
    f.destroy();
  });
  it('preserves each percentage and rejects invalid drafts without changing totals', () => {
    const c=new GuideExpenseSavingsComponent(); c.expenses=0;
    c.openExpense(); c.draft={amount:1180,taxRecognition:50,vatRecognition:50}; c.addExpense();
    c.openExpense(); c.draft={amount:1180,taxRecognition:100,vatRecognition:100}; c.addExpense();
    expect(c.expenses).toBe(2360); expect(c.result.total).toBeCloseTo(857.1,6);
    expect(c.lastSaving).toBeCloseTo(560,6);
    c.openExpense(); c.draft.amount=500; c.cancelExpense(); expect(c.expenses).toBe(2360);
    for(const draft of [
      {amount:0,taxRecognition:100,vatRecognition:100},
      {amount:NaN,taxRecognition:100,vatRecognition:100},
      {amount:100000,taxRecognition:100,vatRecognition:100},
      {amount:10,taxRecognition:101,vatRecognition:100},
      {amount:10,taxRecognition:100,vatRecognition:-1},
    ]) { c.openExpense(); c.draft=draft; c.addExpense(); expect(c.expenses).toBe(2360); expect(c.draftError).not.toBe(''); }
  });
});
