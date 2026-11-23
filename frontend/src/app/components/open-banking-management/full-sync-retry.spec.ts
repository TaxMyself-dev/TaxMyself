import { DestroyRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { OpenBankingErrorComponent } from './open-banking-error.component';
import { BankingToastContentComponent } from './banking-toast-content.component';
import { BankingNotificationService } from './banking-notification.service';
import { SyncStatusService } from '../../services/sync-status.service';
import { MyAccountPage } from '../../pages/my-account/my-account.page';
import { TransactionsPage } from '../../pages/transactions/transactions.page';

describe('banking error full-sync retry', () => {
  const issue={code:'OB-04',errorId:'old-run-error',message:'חלק מהתנועות לא נשמרו'};
  let http:HttpTestingController;
  let sync:SyncStatusService;
  beforeEach(()=>{
    TestBed.configureTestingModule({imports:[HttpClientTestingModule,OpenBankingErrorComponent,BankingToastContentComponent],
      providers:[MessageService,provideRouter([])]});
    sync=TestBed.inject(SyncStatusService);http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>http.verify());
  function pageFixture(pageType:typeof MyAccountPage|typeof TransactionsPage) {
    const page:any=Object.create(pageType.prototype);
    Object.assign(page,{
      fullSyncRetryStarting:signal(false),hasOpenBanking:signal<boolean|null>(true),
      syncProcessStatus:signal<string|null>(null),bankingError:signal<any>(issue),
      syncStatusService:sync,destroyRef:TestBed.inject(DestroyRef),
      restartPolling$:new Subject<void>(),disconnectedReads$:new Subject<void>(),
      isDelegatedClientView:jasmine.createSpy().and.returnValue(false),
      startSyncStatusPolling:jasmine.createSpy(),
      filteredExpensesData:signal([{id:1}]),filteredIncomesData:signal([{id:2}]),
      transToClassify:{retained:true},getTransactions:jasmine.createSpy(),
    });
    page.bankingFullSyncRetry={enabled:()=>page.hasOpenBanking()===true&&!page.isDelegatedClientView(),
      busy:()=>page.fullSyncRetryStarting()||page.syncProcessStatus()==='running',run:()=>page.retryBankingSync()};
    const add=spyOn(TestBed.inject(MessageService),'add').and.callThrough();
    const error=TestBed.createComponent(OpenBankingErrorComponent);
    error.componentRef.setInput('issue',issue);error.componentRef.setInput('fullSyncRetry',page.bankingFullSyncRetry);error.detectChanges();
    const toast=TestBed.createComponent(BankingToastContentComponent);
    toast.componentInstance.message=add.calls.mostRecent().args[0];toast.detectChanges();
    const retryButton=()=>Array.from(toast.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button=>button.textContent?.includes('משוך מחדש את כל התנועות'));
    return{page,error,toast,retryButton};
  }
  function baseline(){http.expectOne(r=>r.url.endsWith('/transactions/sync-status')).flush({fullSync:{runId:'old-run'},sourceResults:[]});}

  for(const pageType of [MyAccountPage,TransactionsPage]) {
    describe(pageType.name,()=>{
      it('clicks the visible action, POSTs full sync once, and waits for a new run',()=>{
        const{page,toast,retryButton}=pageFixture(pageType);
        expect(toast.nativeElement.textContent).toContain('old-run-error');
        retryButton()!.click();toast.detectChanges();
        expect(retryButton()!.disabled).toBeTrue();
        expect(toast.nativeElement.textContent).toContain('סנכרון מלא מתבצע');
        page.retryBankingSync();http.match(r=>r.url.endsWith('/transactions/sync-status')).forEach(request=>request.flush({fullSync:{runId:'old-run'},sourceResults:[]}));
        const request=http.expectOne(r=>r.url.endsWith('/transactions/trigger-sync'));
        expect(request.request.method).toBe('POST');expect(request.request.body).toEqual({});
        request.flush({status:'started'});
        expect(page.startSyncStatusPolling).toHaveBeenCalledWith(...(pageType===MyAccountPage?[true,0,'old-run']:[0,'old-run']));
        expect(page.filteredExpensesData()).toEqual([{id:1}]);
        expect(page.filteredIncomesData()).toEqual([{id:2}]);
        expect(page.transToClassify).toEqual({retained:true});
        http.expectNone(r=>r.url.includes('retry-source'));
      });
      it('joins an existing full sync rather than treating it as a second run',()=>{
        const{page,retryButton}=pageFixture(pageType);retryButton()!.click();baseline();
        http.expectOne(r=>r.url.endsWith('/transactions/trigger-sync')).flush({status:'already_running'});
        expect(page.startSyncStatusPolling).toHaveBeenCalledWith(...(pageType===MyAccountPage?[true,0,undefined]:[0,undefined]));
      });
      it('preserves displayed transactions and offers another attempt after POST failure',()=>{
        const{page,toast,retryButton}=pageFixture(pageType);retryButton()!.click();baseline();
        http.expectOne(r=>r.url.endsWith('/transactions/trigger-sync')).flush({}, {status:503,statusText:'Unavailable'});
        toast.detectChanges();expect(retryButton()!.disabled).toBeFalse();
        expect(page.syncProcessStatus()).toBe('failed');expect(page.bankingError().code).toBe('OB-03');
        expect(page.filteredExpensesData()).toEqual([{id:1}]);expect(page.filteredIncomesData()).toEqual([{id:2}]);
        expect(page.transToClassify).toEqual({retained:true});expect(page.startSyncStatusPolling).not.toHaveBeenCalled();
      });
      it('does not trigger if the baseline state cannot be read',()=>{
        const{page,retryButton}=pageFixture(pageType);retryButton()!.click();
        http.expectOne(r=>r.url.endsWith('/transactions/sync-status')).flush({}, {status:500,statusText:'Error'});
        http.expectNone(r=>r.url.endsWith('/transactions/trigger-sync'));expect(page.syncProcessStatus()).toBe('failed');
      });
      it('cancels before POST if the owner disconnects during the baseline read',()=>{
        const{page,retryButton}=pageFixture(pageType);retryButton()!.click();page.hasOpenBanking.set(false);baseline();
        http.expectNone(r=>r.url.endsWith('/transactions/trigger-sync'));expect(page.startSyncStatusPolling).not.toHaveBeenCalled();
        expect(page.syncProcessStatus()).toBeNull();
      });
      it('does not offer the owner action in represented-client or disconnected mode',()=>{
        const{page,toast,retryButton}=pageFixture(pageType);
        page.isDelegatedClientView.and.returnValue(true);toast.detectChanges();expect(retryButton()).toBeUndefined();
        page.retryBankingSync();http.expectNone(()=>true);
        page.isDelegatedClientView.and.returnValue(false);page.hasOpenBanking.set(false);toast.detectChanges();expect(retryButton()).toBeUndefined();
        page.retryBankingSync();http.expectNone(()=>true);
      });
      it('invalidates the sticky action after leaving its page',()=>{
        const{error,toast,retryButton}=pageFixture(pageType);const action=toast.componentInstance.fullSyncRetry!;
        error.destroy();toast.detectChanges();expect(retryButton()).toBeUndefined();action.run();http.expectNone(()=>true);
      });
      it('removes the matching error notification when the new outcome clears the issue',()=>{
        const{error}=pageFixture(pageType);const clear=spyOn(TestBed.inject(MessageService),'clear').and.callThrough();
        error.componentRef.setInput('issue',null);error.detectChanges();expect(clear).toHaveBeenCalledWith('banking');
      });
    });
  }
  it('does not attach full-pull actions to consent or disconnection errors',()=>{
    const add=spyOn(TestBed.inject(MessageService),'add');const fixture=TestBed.createComponent(OpenBankingErrorComponent);
    fixture.componentRef.setInput('issue',{...issue,code:'OB-05'});
    fixture.componentRef.setInput('fullSyncRetry',{enabled:()=>true,busy:()=>false,run:jasmine.createSpy()});fixture.detectChanges();
    expect(add.calls.mostRecent().args[0].data.fullSyncRetry).toBeUndefined();
  });
  it('does not clear a more recent notification when an older page is destroyed',()=>{
    const{error}=pageFixture(MyAccountPage);const notifications=TestBed.inject(BankingNotificationService);
    notifications.message('new notification',true);const clear=spyOn(TestBed.inject(MessageService),'clear');error.destroy();expect(clear).not.toHaveBeenCalled();
  });
  it('ignores the old cached terminal result and reloads only after the new run completes',()=>{
    const{page}=pageFixture(TransactionsPage);const stream=new Subject<any>();
    spyOn(sync,'getSyncStageStream').and.returnValue(stream);
    page.syncProcessStatus.set('running');
    (TransactionsPage.prototype as any).startSyncStatusPolling.call(page,0,'old-run');
    stream.next({stageState:{runId:'old-run',processStatus:'completed',supportError:issue}});
    expect(page.syncProcessStatus()).toBe('running');expect(page.getTransactions).not.toHaveBeenCalled();
    stream.next({stageState:{runId:'new-run',processStatus:'running'}});
    expect(page.syncProcessStatus()).toBe('running');
    stream.next({stageState:{runId:'new-run',processStatus:'completed'}});
    expect(page.syncProcessStatus()).toBeNull();expect(page.bankingError()).toBeNull();expect(page.getTransactions).toHaveBeenCalledTimes(1);
  });
});
