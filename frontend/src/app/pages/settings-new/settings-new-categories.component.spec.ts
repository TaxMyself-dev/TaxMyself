import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SettingsNewCategoriesComponent } from './settings-new-categories.component';
import { SettingsNewSelectComponent } from './settings-new-select.component';
import { TransactionsService } from '../transactions/transactions.page.service';
import { ExpenseDataService } from '../../services/expense-data.service';
import { AuthService } from '../../services/auth.service';

describe('new category settings', () => {
  it('retains the direct-card preference and loads rules/categories for the selected business', () => {
    const transactions = {getCashflowPreferences: jasmine.createSpy().and.returnValue(of({hasDirectCard:true, excludeDirectCardBankTransactionsFromCashflow:true})),getUserRules:jasmine.createSpy().and.returnValue(of([]))};
    const expenses = {getUserCategoriesGrouped:jasmine.createSpy().and.returnValue(of([]))};
    TestBed.configureTestingModule({imports:[SettingsNewCategoriesComponent],providers:[
      {provide:TransactionsService,useValue:transactions},{provide:ExpenseDataService,useValue:expenses},
      {provide:AuthService,useValue:{isViewingAsClient:()=>false}},
    ]}).overrideComponent(SettingsNewCategoriesComponent,{set:{template:'',imports:[]}});
    const fixture=TestBed.createComponent(SettingsNewCategoriesComponent);
    fixture.componentRef.setInput('businesses',[{businessNumber:'123',businessName:'עסק א'}]);
    fixture.detectChanges();
    expect(fixture.componentInstance.excludeDirect()).toBeTrue();
    expect(transactions.getUserRules).toHaveBeenCalledWith('123');
    expect(expenses.getUserCategoriesGrouped).toHaveBeenCalledWith('123');
    fixture.componentInstance.onBusinessChange('456');fixture.detectChanges();
    expect(transactions.getUserRules).toHaveBeenCalledWith('456');
    expect(expenses.getUserCategoriesGrouped).toHaveBeenCalledWith('456');
  });
  it('adapts option shapes and resets dependent selections', () => {
    const select=new SettingsNewSelectComponent();
    select.items=[{label:'עסק א',value:'123'},{name:'אחר',value:'456'}];select.value='123';select.ngOnChanges();
    expect(select.options.map(x=>x.name)).toEqual(['עסק א','אחר']);expect(select.form.value.value).toBe('123');
    select.value='';select.ngOnChanges();expect(select.form.value.value).toBe('');
    const emit=spyOn(select.valueChange,'emit');select.changed('456');expect(emit).toHaveBeenCalledOnceWith('456');
  });
});
