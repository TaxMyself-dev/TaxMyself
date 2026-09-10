import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { GenericTableComponent } from './generic-table.component';

describe('GenericTableComponent', () => {
  let component: GenericTableComponent<any, any>;
  let fixture: ComponentFixture<GenericTableComponent<any, any>>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ GenericTableComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(GenericTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('treats a Drive source-document link as a stored file', () => {
    expect(component.hasStoredFile({ id: 7, sourceDocumentId: 42 })).toBeTrue();
    expect(component.showAttachButton({ id: 7, sourceDocumentId: 42 })).toBeFalse();
  });

  it('shows attach when neither attachment path exists', () => {
    expect(component.hasStoredFile({ id: 7, file: '' })).toBeFalse();
    expect(component.showAttachButton({ id: 7, file: '' })).toBeTrue();
  });
});
