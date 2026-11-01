import { TestBed } from '@angular/core/testing';
import { OpenBankingErrorComponent, savedConsentLabel } from './open-banking-error.component';

describe('Open banking support details', () => {
  it('never hides a missing direct-card consent', () => {
    expect(savedConsentLabel(false,true)).toContain('ללא הרשאה');
    expect(savedConsentLabel(true,true)).toBe('נמשך דרך חשבון הבנק');
    expect(savedConsentLabel(true,false)).toContain('פעיל');
  });
  it('shows the Hebrew explanation, code, error ID and copy action without technical payloads', () => {
    TestBed.configureTestingModule({imports:[OpenBankingErrorComponent]});
    const fixture=TestBed.createComponent(OpenBankingErrorComponent);
    fixture.componentInstance.issue={code:'OB-04',errorId:'example-id',message:'חלק מהתנועות לא נשמרו באפליקציה'};
    fixture.detectChanges();
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('מזהה שגיאה');expect(text).toContain('example-id');expect(text).toContain('OB-04');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('העתקת');
  });
  it('copies exactly the details shown to the user', async () => {
    const component=new OpenBankingErrorComponent();
    component.issue={code:'OB-04',errorId:'case-1',message:'נתונים חלקיים'};
    const write=spyOn(navigator.clipboard,'writeText').and.resolveTo();
    await component.copy();
    expect(write).toHaveBeenCalledWith('נתונים חלקיים\nקוד: OB-04\nמזהה שגיאה: case-1');
  });
});
