import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { CreateDocSuccessDialogComponent } from './create-doc-success-dialog.component';

describe('CreateDocSuccessDialogComponent', () => {
  let component: CreateDocSuccessDialogComponent;
  let fixture: ComponentFixture<CreateDocSuccessDialogComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ CreateDocSuccessDialogComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateDocSuccessDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
