import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IncomeStatementPage } from './income-statement.page';

describe('IncomeStatementPage', () => {
  let component: IncomeStatementPage;
  let fixture: ComponentFixture<IncomeStatementPage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(IncomeStatementPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
