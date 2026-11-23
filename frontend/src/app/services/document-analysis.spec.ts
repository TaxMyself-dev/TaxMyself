import { fakeAsync, tick } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { DocumentAnalysisService, AnalysisReceipt, AnalysisStatus } from './document-analysis.service';
import { safeAnalysisPatch } from './document-analysis-patch';
const receipt:AnalysisReceipt={queued:true,jobId:'owned-job',state:'READY',filename:'artificial.pdf',driveFileId:'file'};
describe('shared document analysis UI (offline)',()=>{
  it('waits for the durable result and sends the selected business',fakeAsync(()=>{
    const http={get:jasmine.createSpy().and.returnValues(of({state:'READY'}),of({state:'COMPLETED',completion:{invoice:{amount:12}}}))};
    let result:any;new DocumentAnalysisService(http as any).waitFor(receipt,'business-5').subscribe(value=>result=value);
    tick(0);expect(result).toBeUndefined();expect(http.get.calls.first().args[1].params.get('businessNumber')).toBe('business-5');tick(1500);expect(result.invoice.amount).toBe(12);tick(3000);expect(http.get).toHaveBeenCalledTimes(2);
  }));
  it('does not overlap requests and stops polling on unsubscribe',fakeAsync(()=>{
    const response=new Subject<AnalysisStatus>(),http={get:jasmine.createSpy().and.returnValue(response)};
    const sub=new DocumentAnalysisService(http as any).waitFor(receipt,'business-5').subscribe();tick(4500);expect(http.get).toHaveBeenCalledTimes(1);sub.unsubscribe();tick(6000);expect(http.get).toHaveBeenCalledTimes(1);
  }));
  it('reports an unknown outcome without resubmitting the document',fakeAsync(()=>{
    const http={get:jasmine.createSpy().and.returnValue(of({state:'UNKNOWN',errorCode:'AI_UNKNOWN_OUTCOME'}))};let error:any;
    new DocumentAnalysisService(http as any).waitFor(receipt,'business-5').subscribe({error:value=>error=value});tick(0);expect(error.analysisCode).toBe('AI_UNKNOWN_OUTCOME');tick(5000);expect(http.get).toHaveBeenCalledTimes(1);
  }));
  it('preserves edits and dependent supplier/category values',()=>{
    expect(safeAnalysisPatch({amount:10,date:'2026-11-22',supplierId:'AI',taxPercent:100},{amount:0,date:null,supplier:'A',category:1},{amount:20,date:null,supplier:'B',category:1},new Set(['category']))).toEqual({date:'2026-11-22'});
  });
  it('does not overwrite a dirty control even when its value returned to the snapshot',()=>{
    expect(safeAnalysisPatch({amount:10},{amount:0},{amount:0},new Set(['amount']))).toEqual({});
  });
});
