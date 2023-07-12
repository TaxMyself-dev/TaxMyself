import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MyStoragePage } from './my-storage.page';

describe('MyStoragePage', () => {
  let component: MyStoragePage;
  let fixture: ComponentFixture<MyStoragePage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(MyStoragePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
