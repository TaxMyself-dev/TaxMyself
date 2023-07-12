import { ComponentFixture, TestBed } from '@angular/core/testing';
import {  AddInvoicePage } from './add-invoice.page';

describe('MyAcountPage', () => {
  let component:  AddInvoicePage;
  let fixture: ComponentFixture< AddInvoicePage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent( AddInvoicePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
