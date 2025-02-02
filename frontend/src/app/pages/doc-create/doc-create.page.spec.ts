import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { DocCreatePage } from './doc-create.page';

describe('DocCreatePage', () => {
  let component: DocCreatePage;
  let fixture: ComponentFixture<DocCreatePage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(DocCreatePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
