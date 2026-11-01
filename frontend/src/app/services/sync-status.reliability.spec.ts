import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SyncStatusService } from './sync-status.service';

describe('Banking polling recovery', () => {
  let service:SyncStatusService; let http:HttpTestingController;
  const response={fullSync:{processStatus:'completed',resultStatus:'success',finishedAt:'2020-01-01'},sourceResults:[]};
  beforeEach(()=>{TestBed.configureTestingModule({imports:[HttpClientTestingModule]});service=TestBed.inject(SyncStatusService);http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  it('does not cancel a status request that takes longer than the polling interval',fakeAsync(()=>{
    const next=jasmine.createSpy();const sub=service.getSyncStageStream().subscribe(next);
    tick();const request=http.expectOne(r=>r.url.endsWith('/transactions/sync-status'));
    tick(4000);expect(request.cancelled).toBeFalse();
    http.expectNone(r=>r.url.endsWith('/transactions/sync-status'));
    request.flush(response);expect(next).toHaveBeenCalled();sub.unsubscribe();
  }));
  it('bounds waiting even when every response is a stale terminal state',fakeAsync(()=>{
    let last:any;const sub=service.getSyncStageStream().subscribe(value=>last=value);
    for(let i=0;i<200;i++){tick(i===0?0:3000);http.expectOne(r=>r.url.endsWith('/transactions/sync-status')).flush(response);}
    expect(last.stageState.processStatus).toBe('failed');
    expect(last.stageState.supportError.code).toBe('OB-03');
    expect(last.stageState.supportError.errorId).toBeTruthy();expect(sub.closed).toBeTrue();
  }));
});
