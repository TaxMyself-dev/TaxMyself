import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdvanceIncomeTaxReportPage } from './advance-income-tax-report.page';

describe('AdvanceIncomeTaxReportPage', () => {
  let component: AdvanceIncomeTaxReportPage;
  let fixture: ComponentFixture<AdvanceIncomeTaxReportPage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(AdvanceIncomeTaxReportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
