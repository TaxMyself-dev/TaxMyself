import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SyncStatusService, isPreviousPullResult, currentPullSourceResults } from './sync-status.service';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { MyAccountPage } from '../pages/my-account/my-account.page';

describe('Banking polling recovery', () => {
  let service:SyncStatusService; let http:HttpTestingController;
  const response={fullSync:{processStatus:'completed',resultStatus:'success',finishedAt:'2020-01-01'},sourceResults:[]};
  beforeEach(()=>{TestBed.configureTestingModule({imports:[HttpClientTestingModule]});service=TestBed.inject(SyncStatusService);http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  function pullPage(baseline:any, status='started') {
    return {feezbackDialogStatus:signal('prompt'),feezbackDialogTitle:signal(''),feezbackDialogIcon:signal<string|null>(null),
      bankingError:signal<any>(null),syncSourceResults:signal<any[]>([{sourceId:'old'}]),restartPolling$:{next:jasmine.createSpy()},pendingPostConsentSimulate:false,
      syncStatusService:{getSyncResponse:()=>of(baseline),triggerSync:jasmine.createSpy().and.returnValue(of({status}))},
      startSyncStatusPolling:jasmine.createSpy()};
  }
  it('captures the preceding run before triggering the post-consent pull',()=>{
    const page=pullPage({fullSync:{runId:'previous'}});
    MyAccountPage.prototype.onPullTransactionsClick.call(page as any);
    expect(page.startSyncStatusPolling).toHaveBeenCalledWith(true,0,'previous');
    expect(page.restartPolling$.next).toHaveBeenCalled();expect(page.syncSourceResults()).toEqual([]);
  });
  it('joins an already-running pull rather than rejecting its current run ID',()=>{
    const page=pullPage({fullSync:{runId:'current'}},'already_running');
    MyAccountPage.prototype.onPullTransactionsClick.call(page as any);
    expect(page.startSyncStatusPolling).toHaveBeenCalledWith(true,0,undefined);
  });
  it('does not start a pull or show stale results if its baseline status cannot be read',()=>{
    const page=pullPage(null);
    MyAccountPage.prototype.onPullTransactionsClick.call(page as any);
    expect(page.syncStatusService.triggerSync).not.toHaveBeenCalled();
    expect(page.startSyncStatusPolling).not.toHaveBeenCalled();
    expect(page.feezbackDialogStatus()).toBe('failure');
    expect(page.bankingError().code).toBe('OB-03');
  });
  it('waits for a different run even when the previous result just completed',()=>{
    const stage:any={runId:'previous',processStatus:'completed',finishedAt:new Date().toISOString()};
    expect(isPreviousPullResult(stage,'previous')).toBeTrue();
    expect(isPreviousPullResult({...stage,runId:'new'},'previous')).toBeFalse();
    expect(isPreviousPullResult({...stage,runId:null},null)).toBeTrue();
    expect(isPreviousPullResult({...stage,runId:null},'previous')).toBeTrue();
    expect(isPreviousPullResult(stage,undefined)).toBeFalse();
  });
  it('does not hide a polling transport error while waiting for a new run',()=>{
    expect(isPreviousPullResult({supportError:{code:'OB-03'}} as any,null)).toBeFalse();
  });
  it('does not show historical successes, discovery-only direct cards, or cached results as this pull',()=>{
    const data:any={fullSync:{runId:'new'},sourceResults:[
      {sourceId:'7533',status:'success',resultRunId:'new'},
      {sourceId:'9081',status:'success',resultRunId:'old'},
      {sourceId:'0013',status:'skipped_direct',resultRunId:null},
      {sourceId:'5555',status:'failed',resultRunId:'new'},
    ]};
    expect(currentPullSourceResults(data).map(row=>row.sourceId)).toEqual(['7533','5555']);
    data.fullSync.skipReason='cache_exists';expect(currentPullSourceResults(data)).toEqual([]);
    data.fullSync={};expect(currentPullSourceResults(data)).toEqual([]);
  });
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
