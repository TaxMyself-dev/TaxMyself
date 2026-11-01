import { FeezbackService } from './feezback.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { FeezbackDisconnectionService } from './feezback-disconnection.service';
import { FeezbackWebhookService } from './webhook/feezback-webhook.service';
import { connectionOperation } from './consent/connection-operation';

describe('Feezback review regressions',()=>{
  afterEach(()=>jest.restoreAllMocks());
  function discovery(spouseOnly=false){
    const owner:any={firebaseId:'review-owner',hasOpenBanking:!spouseOnly,hasSpouseFeezbackIdentity:false};
    const target=(sub:string)=>spouseOnly?sub.endsWith('_sub_spouse'):!sub.endsWith('_sub_spouse');
    const api={getUserConsents:jest.fn(async(sub:string)=>({consents:target(sub)?[{resourceId:'c',consentStatus:'valid'}]:[]})),
      getUserAccounts:jest.fn(async()=>({accounts:[{iban:'IL991234567',resourceId:'bank-a',consentId:'c'}]})),
      getUserCards:jest.fn(async()=>({cards:[]}))};
    const pointers:any[]=[];
    const sync={getSyncState:jest.fn().mockResolvedValue(null),getSourceResults:jest.fn(async()=>pointers),
      upsertSourceConsents:jest.fn(async(_uid,sources)=>{pointers.push(...sources);}),reconcileSourceConsents:jest.fn().mockResolvedValue(undefined),
      savePermissionsSnapshot:jest.fn(async(_uid,_snapshot,connection)=>{owner.hasOpenBanking=connection.connected;return true;}),
      markSourcesRefreshed:jest.fn().mockResolvedValue(undefined)};
    const users={findOne:jest.fn().mockImplementation(async()=>({...owner})),update:jest.fn(async(_where,patch)=>Object.assign(owner,patch))};
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,api as any,{} as any,{} as any,sync as any,
      users as any,{query:jest.fn().mockResolvedValue(undefined),find:jest.fn().mockResolvedValue([])} as any,{} as any,{} as any);
    return {service,sync,owner};
  }
  it('successful source pull must preserve the aggregate partial result and support ID',async()=>{
    const previous={fullProcessStatus:'completed',fullResultStatus:'partial_success',fullFailureReason:'OB-04|12345678-1234-1234-1234-123456789012'};
    const repo={findOne:jest.fn().mockResolvedValue(previous),upsert:jest.fn().mockResolvedValue(undefined)};
    const sync=new UserSyncStateService(repo as any,{} as any,{} as any);
    await sync.markCacheReadyAfterSourcePull('review-owner');
    expect(repo.upsert.mock.calls[0][0]).toMatchObject({fullResultStatus:'partial_success',fullFailureReason:previous.fullFailureReason});
  });
  it('finishes a disconnected running job without reviving a lifecycle already cleared by cleanup',async()=>{
    const row:any={userId:'review-owner',fullProcessStatus:'empty',fullResultStatus:'none'};
    const repo={update:jest.fn(async(criteria,patch)=>{
      if(row.userId===criteria.userId && row.fullProcessStatus===criteria.fullProcessStatus){Object.assign(row,patch);return {affected:1};}
      return {affected:0};
    })};
    const sync=new UserSyncStateService(repo as any,{} as any,{} as any);
    await sync.markSyncInterrupted('review-owner'); expect(row.fullProcessStatus).toBe('empty');
    row.fullProcessStatus='running'; await sync.markSyncInterrupted('review-owner');
    expect(row).toMatchObject({fullProcessStatus:'failed',fullResultStatus:'none',fullSkipReason:'no_access'});
    expect(row.fullFinishedAt).toBeInstanceOf(Date);
  });
  it('verified spouse discovered by manual refresh must be included in the next ordinary pull',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const {service,sync,owner}=discovery(true);
    await service.refreshUserSources('review-owner','permissions-refresh');
    expect(sync.upsertSourceConsents).toHaveBeenCalledWith('review-owner',expect.arrayContaining([expect.objectContaining({connectionRole:'spouse'})]),expect.any(Date));
    expect(await (service as any).userSubs('review-owner')).toContain('review-owner_sub_spouse');
    expect(owner.hasSpouseFeezbackIdentity).toBe(false);
  });
  it.each([
    {connectionRole:'spouse',consentId:null,resourceId:'r'},
    {connectionRole:'spouse',consentId:'c',resourceId:null},
    {connectionRole:'primary',consentId:'c',resourceId:'r'},
  ])('does not infer spouse coverage from an incomplete or primary-only pointer: %j',async pointer=>{
    const {service,sync}=discovery(); sync.getSourceResults.mockResolvedValue([pointer]);
    expect(await (service as any).userSubs('review-owner')).toEqual(['review-owner_sub']);
  });
  it('propagates saved-link lookup failure instead of silently omitting a possible spouse',async()=>{
    const {service,sync}=discovery(); sync.getSourceResults.mockRejectedValue(new Error('DB unavailable'));
    await expect((service as any).userSubs('review-owner')).rejects.toThrow('DB unavailable');
  });
  it('stored screen read must not wait for an unrelated outstanding provider operation',async()=>{
    let release!:()=>void;
    const provider=connectionOperation('review-queue',()=>new Promise<void>(resolve=>{release=resolve;}));
    await Promise.resolve();
    const service=new FeezbackDisconnectionService({} as any,{findOne:jest.fn().mockResolvedValue({hasOpenBanking:true})} as any,
      {find:jest.fn().mockResolvedValue([])} as any,{getSyncState:jest.fn().mockResolvedValue({permissionsSnapshot:{consents:[],complete:true}})} as any,{} as any);
    let readFinished=false;
    const read=service.storedTargets('review-queue').then(()=>{readFinished=true;});
    await new Promise<void>(resolve=>setImmediate(resolve));
    const finishedBeforeProvider=readFinished;
    release(); await Promise.all([provider,read]);
    expect(finishedBeforeProvider).toBe(true);
  });
  it('VALID after suspension must reconcile consent pointers without requiring a different event',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const feezback={clearConsentOnSources:jest.fn().mockResolvedValue(1),refreshUserSources:jest.fn().mockResolvedValue(undefined)};
    const handler=new FeezbackWebhookService({} as any,feezback as any);
    const body:any={payload:{user:'review-owner_sub@tpp',tpp:'tpp',consent:'c',currentStatus:'suspendedByAspsp'}};
    await (handler as any).handleConsentStatusChanged(body);
    feezback.refreshUserSources.mockClear();
    await (handler as any).handleConsentStatusChanged({payload:{...body.payload,currentStatus:'valid'}});
    expect(feezback.refreshUserSources).toHaveBeenCalled();
  });
  it('discovery diagnostics must mask the entire seven-digit account identifier',async()=>{
    const log=jest.spyOn(console,'log').mockImplementation(()=>{});
    const {service}=discovery();
    await service.refreshUserSources('review-owner','permissions-refresh');
    expect(JSON.stringify(log.mock.calls)).not.toContain('1234567');
  });
  it('a transient final-state write failure must reach failure recovery instead of leaving an idle job running',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const service=Object.create(FeezbackService.prototype) as any;
    const failed=jest.fn().mockResolvedValue(undefined);
    Object.assign(service,{logger:{error:jest.fn(),log:jest.fn(),warn:jest.fn()},
      userRepository:{findOne:jest.fn().mockResolvedValue({hasOpenBanking:true})},billingService:{hasModuleAccess:jest.fn().mockResolvedValue(true)},
      userSyncStateService:{getSourceResults:jest.fn().mockResolvedValue([]),updateSourceResults:jest.fn().mockResolvedValue(undefined),markSyncFailed:failed},
      userSubs:jest.fn().mockResolvedValue(['review-owner_sub']),getSyncWindow:()=>({from:'2026-01-01',to:'2026-11-01'}),
      getAndSaveBankTransactions:jest.fn().mockResolvedValue({}),getAndSaveUserCardTransactions:jest.fn().mockResolvedValue({}),
      combineIdentityPulls:jest.fn().mockReturnValue({}),buildSourceResults:()=>[],
      computePhaseStatus:()=>({normalizedTransactions:[],hasErrors:false,resultStatus:'success',diagnostics:{errors:[]}}),
      markConnectedSyncFinished:jest.fn().mockRejectedValue(new Error('Transient terminal write failure')),
      withConnectedUserLock:async(_uid,action)=>action()});
    await service.doFullSync('review-owner','manual','review',null);
    expect(failed).toHaveBeenCalled();
  });
  it('valid existing rows plus excluded rows must be partial, even when no new cache row was inserted',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const service=Object.create(FeezbackService.prototype) as any;
    const finished=jest.fn().mockResolvedValue(undefined);
    const issue={code:'OB-04',errorId:'12345678-1234-1234-1234-123456789012'};
    Object.assign(service,{logger:{error:jest.fn(),log:jest.fn(),warn:jest.fn()},
      userRepository:{findOne:jest.fn().mockResolvedValue({hasOpenBanking:true})},billingService:{hasModuleAccess:jest.fn().mockResolvedValue(true)},
      userSyncStateService:{getSourceResults:jest.fn().mockResolvedValue([]),updateSourceResults:jest.fn().mockResolvedValue(undefined)},
      userSubs:jest.fn().mockResolvedValue(['review-owner_sub']),getSyncWindow:()=>({from:'2026-01-01',to:'2026-11-01'}),
      getAndSaveBankTransactions:jest.fn().mockResolvedValue({}),getAndSaveUserCardTransactions:jest.fn().mockResolvedValue({}),
      combineIdentityPulls:jest.fn().mockReturnValue({}),buildSourceResults:()=>[],
      computePhaseStatus:()=>({normalizedTransactions:Array.from({length:137},()=>({})),hasErrors:false,resultStatus:'success',diagnostics:{errors:[]}}),
      processTransactionsWithDuplicateAlert:jest.fn().mockResolvedValue({newlySavedToCache:0,alreadyExistingInCache:100,excludedCount:37,supportIssue:issue}),
      markConnectedSyncFinished:finished});
    await service.doFullSync('review-owner','manual','review',null);
    expect(finished).toHaveBeenCalledWith('review-owner','completed','partial_success',0,`OB-04|${issue.errorId}`);
  });
  it('recovers terminal-write failure after the login retry path too',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const service=Object.create(FeezbackService.prototype) as any;
    const source={type:'bank',sourceId:'1111',status:'failed'};
    const failed=jest.fn().mockResolvedValue(undefined);
    Object.assign(service,{logger:{error:jest.fn(),log:jest.fn(),warn:jest.fn()},
      userRepository:{findOne:jest.fn().mockResolvedValue({hasOpenBanking:true})},billingService:{hasModuleAccess:jest.fn().mockResolvedValue(true)},
      userSyncStateService:{getSourceResults:jest.fn().mockResolvedValueOnce([source]).mockResolvedValue([{...source,status:'success'}]),
        markSyncRunning:jest.fn().mockResolvedValue({acquired:true}),markSyncFailed:failed},
      retrySource:jest.fn().mockResolvedValue({...source,status:'success'}),
      markConnectedSyncFinished:jest.fn().mockRejectedValue(new Error('Transient terminal write failure')),
      withConnectedUserLock:async(_uid,action)=>action()});
    await service.doFullSync('review-owner','login','review',{fullProcessStatus:'completed'});
    expect(failed).toHaveBeenCalled();
  });
  it('persists a rejected source as failed while retaining the healthy source outcome',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const service=Object.create(FeezbackService.prototype) as any;
    const persist=jest.fn().mockResolvedValue(undefined);
    const issue={code:'OB-04',errorId:'12345678-1234-1234-1234-123456789012'};
    const sources=[1,2].map(id=>({type:'card',sourceId:String(id),sourceRecordId:id,status:'success',transactionCount:1}));
    Object.assign(service,{logger:{error:jest.fn(),log:jest.fn(),warn:jest.fn()},
      userRepository:{findOne:jest.fn().mockResolvedValue({hasOpenBanking:true})},billingService:{hasModuleAccess:jest.fn().mockResolvedValue(true)},
      userSyncStateService:{getSourceResults:jest.fn().mockResolvedValue([]),updateSourceResults:persist},
      userSubs:jest.fn().mockResolvedValue(['review-owner_sub']),getSyncWindow:()=>({from:'2026-01-01',to:'2026-11-01'}),
      getAndSaveBankTransactions:jest.fn().mockResolvedValue({}),getAndSaveUserCardTransactions:jest.fn().mockResolvedValue({}),
      combineIdentityPulls:jest.fn().mockReturnValue({}),buildSourceResults:()=>sources,
      computePhaseStatus:()=>({normalizedTransactions:[{},{}],hasErrors:false,resultStatus:'success',diagnostics:{errors:[]}}),
      processTransactionsWithDuplicateAlert:jest.fn().mockResolvedValue({newlySavedToCache:1,excludedCount:1,supportIssue:issue,
        sourceFailures:[{sourceRecordId:1,issue}]}),markConnectedSyncFinished:jest.fn().mockResolvedValue(undefined)});
    await service.doFullSync('review-owner','manual','review',null);
    expect(persist).toHaveBeenCalledWith('review-owner',[
      expect.objectContaining({sourceRecordId:1,status:'failed',transactionCount:0,error:`OB-04|${issue.errorId}`}),
      expect.objectContaining({sourceRecordId:2,status:'success',transactionCount:1}),
    ]);
  });
});
