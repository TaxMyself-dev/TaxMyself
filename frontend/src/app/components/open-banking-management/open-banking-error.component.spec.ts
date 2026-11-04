import { provideRouter } from '@angular/router';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { OpenBankingErrorComponent, savedConsentLabel } from './open-banking-error.component';
import { BankingToastContentComponent } from './banking-toast-content.component';
import { BankingNotificationService } from './banking-notification.service';

describe('Open banking snackbar',()=>{
 const issue={code:'OB-05',errorId:'case-1',message:'ביטול לא הושלם'};
 beforeEach(()=>TestBed.configureTestingModule({imports:[OpenBankingErrorComponent,BankingToastContentComponent],providers:[MessageService,provideRouter([])]}));
 it('never hides missing direct consent',()=>{
  expect(savedConsentLabel(false,true)).toContain('ללא הרשאה');
  expect(savedConsentLabel(true,true)).toBe('✓ פעיל');
 });
 it('sends one snackbar per issue without a duplicate inline alert',()=>{
  const add=spyOn(TestBed.inject(MessageService),'add');
  const fixture=TestBed.createComponent(OpenBankingErrorComponent);
  fixture.componentRef.setInput('issue',issue);fixture.detectChanges();
  fixture.componentRef.setInput('issue',{...issue});fixture.detectChanges();
  expect(add).toHaveBeenCalledTimes(1);expect(fixture.nativeElement.textContent).toBe('');
  expect(add.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({key:'banking',sticky:true,data:{supportError:issue}}));
 });
 it('uses the app toast for success',()=>{
  const add=spyOn(TestBed.inject(MessageService),'add');
  TestBed.inject(BankingNotificationService).message('הושלם',true);
  expect(add).toHaveBeenCalledWith(jasmine.objectContaining({key:'banking',severity:'success',life:5000,sticky:false}));
 });
 it('renders support details and confirms copying for exactly one second',fakeAsync(()=>{
  const fixture=TestBed.createComponent(BankingToastContentComponent);
  fixture.componentInstance.message={summary:'שגיאה',detail:issue.message,data:{supportError:issue}};
  fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('case-1');
  const write=spyOn(navigator.clipboard,'writeText').and.resolveTo();
  fixture.componentInstance.copy();flushMicrotasks();fixture.detectChanges();
  expect(write).toHaveBeenCalledWith(issue.message+'\nקוד: OB-05\nמזהה שגיאה: case-1');
  expect(fixture.nativeElement.textContent).toContain('הועתק');
  expect(fixture.nativeElement.querySelector('.pi-check')).toBeTruthy();
  tick(999);expect(fixture.componentInstance.copied()).toBeTrue();
  tick(1);fixture.detectChanges();expect(fixture.componentInstance.copied()).toBeFalse();
  expect(fixture.nativeElement.querySelector('.pi-copy')).toBeTruthy();fixture.destroy();
 }));
 it('reports clipboard failure without claiming success',async()=>{
  const fixture=TestBed.createComponent(BankingToastContentComponent);
  fixture.componentInstance.message={data:{supportError:issue}};
  spyOn(navigator.clipboard,'writeText').and.rejectWith(Error('denied'));
  await fixture.componentInstance.copy();
  expect(fixture.componentInstance.copied()).toBeFalse();
  expect(fixture.componentInstance.copyFailure()).toContain('לא הצלחנו להעתיק');
 });
});
