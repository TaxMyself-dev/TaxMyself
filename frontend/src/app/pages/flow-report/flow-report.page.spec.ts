import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowReportPage } from './flow-report.page';

describe('FlowReportPage', () => {
  let component: FlowReportPage;
  let fixture: ComponentFixture<FlowReportPage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(FlowReportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
