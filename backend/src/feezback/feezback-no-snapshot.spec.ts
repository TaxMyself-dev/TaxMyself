import { FeezbackService } from './feezback.service';
import { FeezbackController } from './feezback.controller';
import { FeezbackDisconnectionService } from './feezback-disconnection.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { TransactionsController } from '../transactions/transactions.controller';

describe('Banking without a stored consent copy',()=>{
  afterEach(()=>jest.restoreAllMocks());
  it('reads current consent links and names on every stored view, including rotations and removals',async()=>{
    const row:any={sourceRecordId:1,sourceId:'1111',type:'card',consentId:'old'};
    const source:any={id:1,sourceName:'1111',sourceType:'CREDIT_CARD',connectionRole:'primary'};
    const api={getUserConsents:jest.fn()};
    const sync={getSyncState:jest.fn().mockResolvedValue(null),getSourceResults:jest.fn(async()=>[row])};
    const service=new FeezbackDisconnectionService(api as any,{findOne:jest.fn().mockResolvedValue({hasOpenBanking:true})} as any,
      {find:jest.fn(async()=>[source])} as any,sync as any,{} as any);
    expect((await service.storedTargets('owner')).consents[0].consentId).toBe('old');
    row.consentId='new'; source.sourceName='new-name';
    expect((await service.storedTargets('owner')).consents[0]).toMatchObject({consentId:'new',sources:[{sourceName:'new-name'}]});
    row.consentId=null;expect((await service.storedTargets('owner')).consents).toEqual([]);
    expect(api.getUserConsents).not.toHaveBeenCalled();
  });
  it('records only operational fields and does not clear a connection on incomplete proof',async()=>{
    const users={findOne:jest.fn().mockResolvedValue({firebaseId:'owner',hasOpenBanking:true}),update:jest.fn()};
    const states={findOne:jest.fn().mockResolvedValue({lastSourcesRefreshAt:new Date('2026-01-01')}),upsert:jest.fn()};
    const repo={manager:{transaction:async callback=>callback({getRepository:entity=>entity.name==='User'?users:states})}};
    const service=new UserSyncStateService(repo as any,{} as any,{} as any);
    const when=new Date('2026-02-01');const failureReason='OB-01|12345678-1234-1234-1234-123456789012';
    expect(await service.recordSourcesRefreshResult('owner',when,{connected:false,complete:false,failureReason})).toBe(true);
    expect(states.upsert).toHaveBeenCalledWith({userId:'owner',lastSourcesRefreshAttemptAt:when,sourcesRefreshFailureReason:failureReason},['userId']);
    expect(users.update).not.toHaveBeenCalled();
    states.findOne.mockResolvedValue({lastSourcesRefreshAt:new Date('2026-01-01')});
    await service.recordSourcesRefreshResult('owner',when,{connected:true,complete:true});
    expect(states.upsert).toHaveBeenLastCalledWith({userId:'owner',lastSourcesRefreshAttemptAt:when,sourcesRefreshFailureReason:null,lastSourcesRefreshAt:when},['userId']);
    expect(users.update).toHaveBeenCalledWith({firebaseId:'owner'},{hasOpenBanking:true});
    await service.recordSourcesRefreshResult('owner',when,{connected:false,complete:true,sourcesRefreshed:false});
    expect(states.upsert).toHaveBeenLastCalledWith({userId:'owner',lastSourcesRefreshAttemptAt:when,sourcesRefreshFailureReason:null},['userId']);
  });
  it('returns pending permissions without sources after saving verified links, without persisting a permission list or pulling transactions',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const api={getUserConsents:jest.fn(async sub=>({consents:sub.endsWith('_spouse')?[]:[{resourceId:'pending',consentStatus:'received'}]})),
      getUserAccounts:jest.fn().mockResolvedValue({accounts:[]}),getUserCards:jest.fn().mockResolvedValue({cards:[]})};
    const sync={recordSourcesRefreshResult:jest.fn().mockResolvedValue(true),reconcileSourceConsents:jest.fn(),upsertSourceConsents:jest.fn()};
    const processing={process:jest.fn()};const enrollment={connectionVerified:jest.fn()};
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,api as any,{} as any,processing as any,sync as any,
      {findOne:jest.fn().mockResolvedValue({firebaseId:'owner'})} as any,{find:jest.fn().mockResolvedValue([])} as any,{} as any,{} as any,enrollment as any);
    const result=await service.refreshUserSources('owner','permissions-refresh');
    expect(result).toMatchObject({complete:true,consents:[{consentId:'pending',status:'received',sources:[]}]});
    expect(sync.recordSourcesRefreshResult).toHaveBeenCalledWith('owner',expect.any(Date),{connected:false,complete:true,failureReason:undefined});
    expect(processing.process).not.toHaveBeenCalled();expect(enrollment.connectionVerified).not.toHaveBeenCalled();
  });
  it('passes the just-verified preview to the browser rather than rebuilding it from stored links',async()=>{
    const current={consents:[{consentId:'pending',connectionRole:'primary',status:'received',sources:[]}],complete:true,hasOpenBanking:false,errors:[]};
    const provider={refreshUserSources:jest.fn().mockResolvedValue(current)};
    const stored={storedTargets:jest.fn()};
    const controller=new FeezbackController(provider as any,{} as any,{} as any,{} as any,undefined,stored as any);
    expect(await controller.refreshPermissions({user:{firebaseId:'owner'}} as any)).toBe(current);
    expect(stored.storedTargets).not.toHaveBeenCalled();
  });
  it('returns a post-consent error only for an attempt covering the current consent flow',async()=>{
    const failure='OB-02|12345678-1234-1234-1234-123456789012';
    const state:any={lastConsentInitiatedAt:new Date('2026-02-02'),lastSourcesRefreshAttemptAt:new Date('2026-02-03'),sourcesRefreshFailureReason:failure};
    const controller=Object.create(TransactionsController.prototype) as any;
    Object.assign(controller,{logger:{log:jest.fn()},userSyncStateService:{getSyncState:jest.fn(async()=>state)},
      feezbackService:{hasUnprocessedConsentFlow:()=>true}});
    expect(await controller.postConsentSync({user:{firebaseId:'owner'}})).toMatchObject({status:'failed',supportError:{code:'OB-02'}});
    state.lastSourcesRefreshAttemptAt=new Date('2026-02-01');
    expect(await controller.postConsentSync({user:{firebaseId:'owner'}})).toEqual({status:'pending'});
    state.lastConsentInitiatedAt=new Date('2026-02-02T12:00:00.600Z');
    state.lastSourcesRefreshAttemptAt=new Date('2026-02-02T12:00:00.500Z');
    expect(await controller.postConsentSync({user:{firebaseId:'owner'}})).toEqual({status:'pending'});
    state.lastSourcesRefreshAttemptAt=new Date('2026-02-02T12:00:00.700Z');
    expect(await controller.postConsentSync({user:{firebaseId:'owner'}})).toMatchObject({status:'failed'});
  });
});
