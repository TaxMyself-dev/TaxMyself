import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VatReportPage } from './vat-report.page';

describe('VatReportPage', () => {
  let component: VatReportPage;
  let fixture: ComponentFixture<VatReportPage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(VatReportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
