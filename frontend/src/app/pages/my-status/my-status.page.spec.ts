import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MyStatusPage } from './my-status.page';

describe('MyStatusPage', () => {
  let component: MyStatusPage;
  let fixture: ComponentFixture<MyStatusPage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(MyStatusPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
