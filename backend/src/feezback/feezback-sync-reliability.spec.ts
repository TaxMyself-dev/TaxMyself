import { FeezbackService } from './feezback.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { FeezbackDisconnectionService } from './feezback-disconnection.service';
import { FeezbackWebhookService } from './webhook/feezback-webhook.service';
import { BankingBatchError, bankingIssue } from './core/open-banking-issue';
import { TransactionsController } from '../transactions/transactions.controller';
import { User } from '../users/user.entity';
import { Source } from '../transactions/source.entity';
import { UserSyncState } from '../transactions/user-sync-state.entity';

describe('Open banking reliability regression', () => {
  afterEach(() => jest.restoreAllMocks());
  const source = (id: number) => ({ id, userId: 'owner', sourceName: String(id), sourceType: 'CREDIT_CARD', connectionRole: 'primary' });
  function batch() {
    const state = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null), create: jest.fn(x => x),
      save: jest.fn().mockImplementation(async x => { if(x.sourceId === '1') throw { code: 'WARN_DATA_TRUNCATED' }; return x; }),
      update: jest.fn().mockResolvedValue({ affected: 1 }), insert: jest.fn().mockResolvedValue({}) };
    const sources = { findOne: jest.fn(async ({where}) => source(Number(where.sourceName ?? where.id))) };
    return { service: new UserSyncStateService({} as any, state as any, sources as any), state };
  }
  it('continues after a direct-card status write fails and reports a partial connection save', async () => {
    const { service, state } = batch();
    await expect(service.upsertSourceConsents('owner', [
      { type:'card', sourceId:'1', consentId:'c', isDirect:true }, { type:'card', sourceId:'2', consentId:'c' },
    ])).rejects.toMatchObject({ completed:1, issues:[expect.objectContaining({code:'OB-02'})] });
    expect(state.save).toHaveBeenCalledTimes(2);
    expect(state.save.mock.calls[0][0].status).toBe('skipped_direct');
    expect(state.save.mock.calls[1][0].consentId).toBe('c');
  });
  it('continues outcome writes after one source fails', async () => {
    const {service,state} = batch(); state.insert.mockRejectedValueOnce({code:'DB_UNAVAILABLE'});
    await expect(service.updateSourceResults('owner', [
      {type:'card',sourceId:'1',status:'success',transactionCount:10},
      {type:'card',sourceId:'2',status:'success',transactionCount:3},
    ])).rejects.toBeInstanceOf(BankingBatchError);
    expect(state.insert).toHaveBeenCalledTimes(2);
  });
  it('does not let a stale refresh rotate a newer consent', async () => {
    const {service,state}=batch();
    state.findOne.mockResolvedValue({consentId:'new',consentVerifiedAt:new Date('2026-11-02')});
    await expect(service.upsertSourceConsents('owner',[{type:'card',sourceId:'2',consentId:'old'}],new Date('2026-11-01'))).rejects.toBeInstanceOf(BankingBatchError);
    expect(state.update).not.toHaveBeenCalled();
  });
  it('only clears pointers in a fully verified source scope and preserves unknown consents', async () => {
    const {state}=batch();
    const rows=[
      {sourceRecordId:1,sourceId:'1',type:'card',consentId:'protected',connectionRole:'primary'},
      {sourceRecordId:2,sourceId:'2',type:'bank',consentId:'bank',connectionRole:'primary'},
      {sourceRecordId:3,sourceId:'3',type:'card',consentId:'gone',connectionRole:'primary'},
    ] as any;
    const owned=rows.map(row=>({...source(row.sourceRecordId),sourceType:row.type==='bank'?'BANK_ACCOUNT':'CREDIT_CARD'}));
    state.findOne.mockImplementation(async({where})=>rows.find(row=>row.sourceRecordId===where.sourceRecordId));
    const manager:any={getRepository:entity=>entity===User?{findOne:async()=>({firebaseId:'owner'})}:entity===UserSyncState?{findOne:async()=>null}:
      entity===Source?{find:async()=>owned,findOne:async({where})=>owned.find(source=>source.id===where.id)}:state,
      update:jest.fn(),delete:jest.fn().mockResolvedValue({affected:1})};
    const service=new UserSyncStateService({manager:{transaction:async fn=>fn(manager)}} as any,state as any,{} as any);
    await service.reconcileSourceConsents('owner','primary',[{type:'card',sources:[]}],new Date(),['protected']);
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.update.mock.calls[0][0].sourceRecordId).toBe(3);
  });
  it('reports all 37 transactions with missing local links and still processes the eligible source', async () => {
    const service=Object.create(FeezbackService.prototype) as any;
    service.logger={error:jest.fn(),log:jest.fn()};
    service.withConnectedUserLock=async (_id,fn)=>fn();
    service.sourceRepository={find:jest.fn().mockResolvedValue([source(1),source(2),source(3)])};
    service.userSyncStateService={getSourceResults:jest.fn().mockResolvedValue([{sourceRecordId:3,consentId:'valid'}])};
    service.processEligibleTransactions=jest.fn(async (_id,tx)=>({newlySavedToCache:tx.length,alreadyExistingInCache:0,deduplicatedCount:0}));
    const tx=[...Array.from({length:32},()=>({sourceRecordId:1})),...Array.from({length:5},()=>({sourceRecordId:2})),{sourceRecordId:3}];
    const result=await service.processTransactionsWithDuplicateAlert('owner',tx,'test');
    expect(result).toMatchObject({newlySavedToCache:1,excludedCount:37,supportIssue:{code:'OB-04'}});
    expect(result.sourceFailures.map(failure=>failure.sourceRecordId)).toEqual([1,2]);
    expect(service.logger.error).toHaveBeenCalledTimes(2);
    expect(service.processEligibleTransactions.mock.calls[0][1]).toEqual([{sourceRecordId:3}]);
  });
  it('loads the saved permission view without provider access or database writes', async () => {
    const api={getUserConsents:jest.fn()}; const users={findOne:jest.fn().mockResolvedValue({hasOpenBanking:true}),update:jest.fn()};
    const sync={getSyncState:jest.fn().mockResolvedValue(null),getSourceResults:jest.fn().mockResolvedValue([
      {sourceRecordId:1,consentId:'saved',type:'card',sourceId:'1'}])};
    const cleanup={cleanup:jest.fn()};
    const service=new FeezbackDisconnectionService(api as any,users as any,{find:jest.fn().mockResolvedValue([source(1)])} as any,sync as any,cleanup as any);
    expect(await service.storedTargets('owner')).toMatchObject({complete:true,consents:[{consentId:'saved',sources:[{sourceRecordId:1}]}]});
    expect(api.getUserConsents).not.toHaveBeenCalled(); expect(users.update).not.toHaveBeenCalled(); expect(cleanup.cleanup).not.toHaveBeenCalled();
  });
  it('records webhook failure separately from receipt and allows an identical failed event to recover', async () => {
    const repo:any={create:jest.fn(x=>({...x,id:'event'})),save:jest.fn().mockResolvedValue(undefined),update:jest.fn().mockResolvedValue({affected:1}),findOne:jest.fn()};
    const feezback={refreshUserSources:jest.fn().mockRejectedValueOnce(new Error('failure')).mockResolvedValue(undefined)};
    const service=new FeezbackWebhookService(repo,feezback as any);
    const body={event:'UserDataIsAvailable',payload:{user:'owner_sub@tpp',tpp:'tpp'}};
    await service.handleWebhook(body);
    const failed=repo.update.mock.calls[0][1]; expect(failed.processedAt).toBeNull(); expect(failed.processingError).toMatch(/^OB-02\|/);
    repo.save.mockRejectedValue({code:'ER_DUP_ENTRY'});
    repo.findOne.mockResolvedValue({id:'event',eventType:'UserDataIsAvailable',processedAt:null,processingError:failed.processingError,processingStartedAt:new Date()});
    await service.handleWebhook(body);
    expect(feezback.refreshUserSources).toHaveBeenCalledTimes(2);
    expect(repo.update.mock.calls[repo.update.mock.calls.length-1][1]).toMatchObject({processingError:null,processedAt:expect.any(Date)});
  });
  it('redacts operational errors while correlating the public support ID', () => {
    const logger={error:jest.fn()};
    const issue=bankingIssue(logger,'transaction_save','owner','source_write_failed',
      {code:'ER_DATA_TOO_LONG',message:'password=secret account=123456789',config:{Authorization:'token'}},{sourceId:'123456789'});
    const line=logger.error.mock.calls[0][0];
    expect(line).toContain(issue.errorId); expect(line).toContain('ER_DATA_TOO_LONG');
    expect(line).not.toContain('secret');expect(line).not.toContain('token');expect(line).not.toContain('123456789');
  });
  it('never overwrites a newer refresh result or connection flag', async () => {
    const users={findOne:jest.fn().mockResolvedValue({firebaseId:'owner'}),update:jest.fn()};
    const states={findOne:jest.fn().mockResolvedValue({lastSourcesRefreshAttemptAt:new Date('2026-11-02T00:00:00Z')}),upsert:jest.fn()};
    const root={manager:{transaction:async callback=>callback({getRepository:entity=>entity.name==='User'?users:states})}};
    const service=new UserSyncStateService(root as any,{} as any,{} as any);
    expect(await service.recordSourcesRefreshResult('owner',new Date('2026-11-01T00:00:00Z'), {connected:false,complete:true})).toBe(false);
    expect(states.upsert).not.toHaveBeenCalled();expect(users.update).not.toHaveBeenCalled();
    expect(users.findOne).toHaveBeenCalledWith(expect.objectContaining({where:{firebaseId:'owner'},lock:{mode:'pessimistic_write'}}));
  });
  it('explicit permission refresh preserves a failed card scope while saving an independently verified bank, without billing or transaction pulls', async () => {
    const api={getUserConsents:jest.fn(async sub=>({consents:sub.endsWith('_spouse')?[]:[{resourceId:'c',consentStatus:'valid'}]})),
      getUserAccounts:jest.fn().mockResolvedValue({accounts:[{iban:'IL1234567',resourceId:'a',consentId:'c'}]}),
      getUserCards:jest.fn().mockRejectedValue({status:403,code:'DENIED'})};
    const sync={getSyncState:jest.fn().mockResolvedValue(null),recordSourcesRefreshResult:jest.fn().mockResolvedValue(true),
      upsertSourceConsents:jest.fn().mockResolvedValue(undefined),reconcileSourceConsents:jest.fn().mockResolvedValue(undefined),
      markSourcesRefreshed:jest.fn()};
    const enrollment={connectionVerified:jest.fn()}; const processing={process:jest.fn()};
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,api as any,{} as any,processing as any,sync as any,
      {findOne:jest.fn().mockResolvedValue({firebaseId:'owner'}),update:jest.fn()} as any,
      {find:jest.fn().mockResolvedValue([]),query:jest.fn().mockResolvedValue(undefined)} as any,{} as any,{} as any,enrollment as any);
    await expect(service.refreshUserSources('owner','permissions-refresh')).rejects.toBeInstanceOf(BankingBatchError);
    expect(sync.upsertSourceConsents).toHaveBeenCalledWith('owner',[expect.objectContaining({type:'bank',consentId:'c'})],expect.any(Date));
    expect(sync.reconcileSourceConsents).not.toHaveBeenCalled();
    expect(sync.markSourcesRefreshed).not.toHaveBeenCalled();expect(enrollment.connectionVerified).not.toHaveBeenCalled();
    expect(processing.process).not.toHaveBeenCalled();
    expect(sync.recordSourcesRefreshResult).toHaveBeenCalledWith('owner',expect.any(Date),expect.objectContaining({complete:false,failureReason:expect.stringMatching(/^OB-01\|/)}));
  });
  it('marks a full pull partial when the provider succeeds but 37 transactions cannot be saved', async () => {
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const service=Object.create(FeezbackService.prototype) as any;
    const issue=bankingIssue({error:jest.fn()},'transaction_save','owner','missing_current_consent_link');
    Object.assign(service,{logger:{error:jest.fn(),log:jest.fn(),warn:jest.fn()},
      userRepository:{findOne:jest.fn().mockResolvedValue({hasOpenBanking:true})},billingService:{hasModuleAccess:jest.fn().mockResolvedValue(true)},
      userSyncStateService:{getSourceResults:jest.fn().mockResolvedValue([]),updateSourceResults:jest.fn().mockResolvedValue(undefined)},
      userSubs:jest.fn().mockResolvedValue(['owner_sub']),getSyncWindow:()=>({from:'2025-01-01',to:'2026-01-01'}),
      getAndSaveBankTransactions:jest.fn().mockResolvedValue({}),getAndSaveUserCardTransactions:jest.fn().mockResolvedValue({}),
      combineIdentityPulls:jest.fn().mockReturnValue({}),buildSourceResults:()=>[],
      computePhaseStatus:()=>({normalizedTransactions:[{sourceRecordId:1}],hasErrors:false,resultStatus:'success',diagnostics:{errors:[]}}),
      processTransactionsWithDuplicateAlert:jest.fn().mockResolvedValue({newlySavedToCache:1,excludedCount:37,supportIssue:issue}),
      markConnectedSyncFinished:jest.fn().mockResolvedValue(undefined)});
    await service.doFullSync('owner','manual','owner',null);
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner','completed','partial_success',1,`OB-04|${issue.errorId}`,undefined);
  });
  it('never translates an outstanding consent into a running transaction job and exposes the matching support ID', async () => {
    const controller=Object.create(TransactionsController.prototype) as any;
    const issue=bankingIssue({error:jest.fn()},'transaction_save','owner','write_failed');
    controller.feezbackService={hasUnprocessedConsentFlow:()=>true};
    controller.userSyncStateService={getSyncState:jest.fn().mockResolvedValue({fullProcessStatus:'completed',fullResultStatus:'partial_success',fullFailureReason:`${issue.code}|${issue.errorId}`}),getSourceResults:jest.fn().mockResolvedValue([])};
    const result=await controller.getSyncStatus({user:{firebaseId:'owner'}});
    expect(result.fullSync).toMatchObject({processStatus:'completed',supportError:{code:'OB-04',errorId:issue.errorId}});
    controller.userSyncStateService.getSyncState.mockResolvedValue({fullProcessStatus:'running'});
    expect(await controller.syncStateAllowsFetch('owner')).toBe(true);
  });
  it('normalizes cards independently so one malformed card cannot discard another card', async () => {
    const api={getUserCards:jest.fn().mockResolvedValue({cards:[
      {resourceId:'bad',maskedPan:'****1111',consentId:'c',balances:[{amount:1}]},
      {resourceId:'good',maskedPan:'****2222',consentId:'c',balances:[{amount:1}]},
    ]})};
    const consent={getCardTransactions:jest.fn(async(_sub,_consent,id)=>({transactions:{booked:[{transactionId:id}]}}))};
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,api as any,consent as any,{} as any,{} as any,
      {} as any,{query:jest.fn().mockResolvedValue(undefined),find:jest.fn().mockResolvedValue([])} as any,{} as any,{} as any);
    jest.spyOn(service as any,'saveSourceTransactionsToFile').mockReturnValue({});
    jest.spyOn(service as any,'normalizeCardTransactions').mockImplementation((rows:any[])=>{
      if(rows[0]?.transactionId==='bad')throw Error('Malformed card');
      return rows.map(row=>({paymentIdentifier:'2222',externalTransactionId:row.transactionId}));
    });
    const result=await (service as any).getAndSaveUserCardTransactionsInternalForIdentity('owner','owner_sub');
    expect(result.normalizedTransactions).toHaveLength(1);
    expect(result.cardErrors).toHaveLength(1);
    expect(result.sourceResults.find(source=>source.sourceId==='1111').status).toBe('failed');
    expect(result.sourceResults.find(source=>source.sourceId==='2222').status).toBe('success');
    expect(result.processingError).toMatch(/^OB-04\|/);
  });
  it('does not upgrade the whole sync to success while another source still has an authorization failure', async () => {
    const sync={markSyncRunning:jest.fn().mockResolvedValue({acquired:true}),getSourceResults:jest.fn().mockResolvedValue([
      {type:'bank',sourceId:'1111',status:'success'},
      {type:'card',sourceId:'2222',status:'failed',error:'OB-03|12345678-1234-1234-1234-123456789012|403'},
    ])};
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,{} as any,{} as any,{} as any,sync as any,
      {} as any,{} as any,{} as any,{} as any);
    jest.spyOn(service as any,'withConnectedUserLock').mockImplementation(async(_user,action:any)=>action());
    jest.spyOn(service,'retrySource').mockResolvedValue({type:'bank',sourceId:'1111',status:'success',transactionCount:1});
    const finished=jest.spyOn(service as any,'markConnectedSyncFinished').mockResolvedValue(undefined);
    await (service as any).retryFailedSources('owner',[{type:'bank',sourceId:'1111',status:'failed'}],'owner');
    expect(finished).toHaveBeenCalledWith('owner','completed','partial_success',0,expect.stringMatching(/^OB-03\|/),undefined);
  });
  it('counts an existing-expense match as a cached row, not a second removed duplicate', async () => {
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,{} as any,{} as any,{} as any,
      {getSourceResults:jest.fn().mockResolvedValue([{sourceRecordId:1,consentId:'c'}])} as any,
      {} as any,{find:jest.fn().mockResolvedValue([source(1)])} as any,{} as any,{} as any);
    jest.spyOn(service as any,'withConnectedUserLock').mockImplementation(async(_user,action:any)=>action());
    jest.spyOn(service as any,'processEligibleTransactions').mockResolvedValue({newlySavedToCache:1,skippedDuplicateMatch:1});
    const log=jest.spyOn((service as any).logger,'log').mockImplementation(()=>{});
    const result=await (service as any).processTransactionsWithDuplicateAlert('owner',[{sourceRecordId:1,paymentIdentifier:'1'}],'test');
    expect(result.excludedCount).toBe(0);
    const diagnostic=JSON.parse(String(log.mock.calls[log.mock.calls.length-1][0]).replace('[OpenBanking] ',''));
    expect(diagnostic.counts).toEqual({received:1,notSaved:0,saved:1,existing:0,duplicates:0,matchedExistingExpenses:1});
  });
  it('classifies processing exceptions as save failures, including single-source callers', async () => {
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,{} as any,{} as any,{} as any,
      {getSourceResults:jest.fn().mockResolvedValue([{sourceRecordId:1,consentId:'c'}])} as any,
      {} as any,{find:jest.fn().mockResolvedValue([source(1)])} as any,{} as any,{} as any);
    jest.spyOn(service as any,'withConnectedUserLock').mockImplementation(async(_user,action:any)=>action());
    jest.spyOn(service as any,'processEligibleTransactions').mockRejectedValue({code:'ER_TEST_DB_FAILURE',sql:'private data'});
    const failure=await (service as any).processTransactionsWithDuplicateAlert('owner',[{sourceRecordId:1,paymentIdentifier:'1'}],'test').catch(error=>error);
    expect(failure).toBeInstanceOf(BankingBatchError);
    expect(failure.issues[0]).toMatchObject({code:'OB-04',partial:false});
  });
});
