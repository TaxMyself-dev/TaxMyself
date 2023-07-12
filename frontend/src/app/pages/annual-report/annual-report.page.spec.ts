import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnnualReportPage } from './annual-report.page';

describe('AnnualReportPage', () => {
  let component: AnnualReportPage;
  let fixture: ComponentFixture<AnnualReportPage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(AnnualReportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
