import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ReportReviewEditDialogComponent } from './report-review-edit-dialog.component';
describe('document routing provenance in shared approval details',()=>{
  it('renders the server-provided AI note without interpreting it as HTML',async()=>{
    await TestBed.configureTestingModule({imports:[ReportReviewEditDialogComponent],providers:[provideNoopAnimations(),provideRouter([])]}).compileComponents();
    const fixture=TestBed.createComponent(ReportReviewEditDialogComponent);
    fixture.componentRef.setInput('fields',{category:'',subCategory:'',subCategoryId:null,accountId:null,vatPercent:0,taxPercent:0,reductionPercent:0,isEquipment:false,date:'2026-11-22',amount:1,currency:'ILS',ilsAmount:null,fxRateToIls:null,supplierId:'',supplier:'',reportPeriod:'',reportPeriodOverridden:false});
    fixture.componentRef.setInput('routingNote','שויך לפי AI — <script>untrusted</script>');
    fixture.componentRef.setInput('visible',true);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const note=fixture.nativeElement.querySelector('[role=note]') as HTMLElement;
    expect(note.textContent).toContain('שויך לפי AI');expect(note.querySelector('script')).toBeNull();
    fixture.destroy();
  });
});
