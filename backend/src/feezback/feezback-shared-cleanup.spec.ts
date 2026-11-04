import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { UserSyncState } from '../transactions/user-sync-state.entity';
import { UserSourceSyncState } from '../transactions/user-source-sync-state.entity';
import { Source } from '../transactions/source.entity';
import { User } from '../users/user.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { UserTransactionCacheState } from '../transactions/user-transaction-cache-state.entity';
import { TransactionsController } from '../transactions/transactions.controller';
import { FeezbackController } from './feezback.controller';
import { BankingBatchError } from './core/open-banking-issue';
import { FeezbackService } from './feezback.service';

describe('Verified shared permission cleanup and current-run summaries',()=>{
  afterEach(()=>jest.restoreAllMocks());
  const when=new Date('2026-11-01T10:00:00Z');
  function fixture(){
    const durable={slim:[{id:1,category:'saved',billId:7}],expenses:[{id:2}],rules:[{id:3}],webhooks:[{id:4}]};
    let db:any={sources:[{id:1,userId:'owner',sourceName:'7533',sourceType:'CREDIT_CARD',connectionRole:'primary'},
      {id:2,userId:'owner',sourceName:'9081',sourceType:'CREDIT_CARD',connectionRole:'primary'},
      {id:3,userId:'owner',sourceName:'9081',sourceType:'CREDIT_CARD',connectionRole:'spouse'},
      {id:4,userId:'other',sourceName:'9081',sourceType:'CREDIT_CARD',connectionRole:'primary'}],
      rows:[1,2,3,4].map(id=>({userId:id===4?'other':'owner',sourceRecordId:id,consentId:'old',resourceId:'r'+id,status:'success',transactionCount:93,resultRunId:'previous'})),
      cache:[1,2,3,4].map(id=>({userId:id===4?'other':'owner',sourceRecordId:id})),freshness:[{userId:'owner'},{userId:'other'}],latest:{}};
    let fail=false;
    const root:any={manager:{transaction:async callback=>{
      const working=structuredClone(db);
      const matches=(row:any,where:any)=>Object.entries(where).every(([key,value]:any)=>value?.type==='isNull'?row[key]==null:value?.value?value.value.includes(row[key]):row[key]===value);
      const repo=(entity:any)=>({
        find:async({where})=>(entity===Source?working.sources:working.rows).filter(row=>matches(row,where)),
        findOne:async({where})=>entity===User?{firebaseId:'owner'}:entity===UserSyncState?working.latest:
          (entity===Source?working.sources:working.rows).find(row=>matches(row,where)),
        update:async(where,patch)=>{working.rows.filter(row=>matches(row,where)).forEach(row=>Object.assign(row,patch));},
        insert:async row=>{working.rows.push(row);},
      });
      const manager:any={getRepository:repo,update:async(entity,where,patch)=>{
        if(entity===UserSyncState){Object.assign(working.latest,patch);return;}
        if(entity!==UserSourceSyncState)throw Error('Durable update attempted');
        await repo(entity).update(where,patch);
      },delete:async(entity,where)=>{
        if(fail)throw Error('delete failed');
        const key=entity===FullTransactionCache?'cache':entity===UserTransactionCacheState?'freshness':null;
        if(!key)throw Error('Durable delete attempted');
        const before=working[key].length;working[key]=working[key].filter(row=>!matches(row,where));return{affected:before-working[key].length};
      }};
      const result=await callback(manager);db=working;return result;
    }}};
    const service=new UserSyncStateService(root,{} as any,{} as any);
    return {service,get db(){return db;},durable,failDelete:()=>{fail=true;}};
  }
  it('removes only cancelled operational data, retaining alternate coverage, the spouse and durable data',async()=>{
    const f=fixture();const before=structuredClone(f.durable);
    await f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:['7533']}],when);
    expect(f.db.cache.map(row=>row.sourceRecordId)).toEqual([1,3,4]);
    expect(f.db.rows.find(row=>row.sourceRecordId===2)).toMatchObject({consentId:null,resourceId:null,status:'not_synced',transactionCount:0,resultRunId:null});
    expect(f.db.rows.find(row=>row.sourceRecordId===1).consentId).toBe('old');
    expect(f.db.sources).toHaveLength(4);expect(f.durable).toEqual(before);
  });
  it('cleans rows whose consent was already cleared by a previous refresh',async()=>{
    const f=fixture();f.db.rows[1].consentId=null;
    await f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:['7533']}],when);
    expect(f.db.cache.map(row=>row.sourceRecordId)).not.toContain(2);
  });
  it('retains an unknown consent and newer verified reconnection',async()=>{
    const f=fixture();f.db.rows[1].consentVerifiedAt=new Date('2026-11-02');
    await f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:[]}],when,['old']);
    expect(f.db.cache).toHaveLength(4);
  });
  it('rolls pointer/results/cache changes back together on cleanup failure',async()=>{
    const f=fixture();const before=structuredClone(f.db);f.failDelete();
    await expect(f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:[]}],when)).rejects.toThrow('delete failed');
    expect(f.db).toEqual(before);
  });
  it('does not certify disconnection when a newer source reconnection has not yet published its global flag',async()=>{
    const f=fixture();f.db.rows[1].consentVerifiedAt=new Date('2026-11-02');
    await expect(f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:['7533']}],when)).rejects.toThrow('superseded');
    expect(f.db.cache).toHaveLength(4);
  });
  it('does not let stale complete verification delete newer state',async()=>{
    const f=fixture();f.db.latest.lastSourcesRefreshAttemptAt=new Date('2026-11-02');
    await expect(f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:[]}],when)).rejects.toThrow('Superseded');
    expect(f.db.cache).toHaveLength(4);
  });
  it('invalidates an obsolete aggregate outcome but does not interrupt a running pull',async()=>{
    const f=fixture();f.db.latest={fullProcessStatus:'completed',fullRunId:'old',fullRowsWritten:93,fullFailureReason:'old error'};
    await f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:['7533']}],when);
    expect(f.db.latest).toMatchObject({fullProcessStatus:'empty',fullRunId:null,fullRowsWritten:0,fullFailureReason:null});
    const running=fixture();running.db.latest={fullProcessStatus:'running',fullRunId:'current'};
    await running.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:['7533']}],when);
    expect(running.db.latest).toMatchObject({fullProcessStatus:'running',fullRunId:'current'});
  });
  it('does not repeatedly invalidate fresh active data once cancelled data has already been cleaned',async()=>{
    const f=fixture();
    await f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:['7533']}],when);
    f.db.latest={fullProcessStatus:'completed',fullRunId:'new'};f.db.freshness.push({userId:'owner'});
    await f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:['7533']}],new Date('2026-11-01T10:01:00Z'));
    expect(f.db.latest.fullRunId).toBe('new');
    expect(f.db.freshness.some(row=>row.userId==='owner')).toBe(true);
  });
  it('clears legacy orphan cache only after verified absence across both identities',async()=>{
    const f=fixture();f.db.rows.filter(row=>row.userId==='owner').forEach(row=>row.consentId=null);
    f.db.cache.push({userId:'owner',sourceRecordId:null});
    await f.service.reconcileSourceConsents('owner','primary',[{type:'card',sources:[]}],when,[],true);
    expect(f.db.cache.some(row=>row.userId==='owner'&&row.sourceRecordId===null)).toBe(false);
    expect(f.db.cache.some(row=>row.userId==='other')).toBe(true);
  });
  it('tags outcomes with the current job and ignores outcomes from a superseded job',async()=>{
    const states:any={findOne:jest.fn().mockResolvedValue({fullRunId:'current',fullStartedAt:when})};
    const rows:any={findOne:jest.fn().mockResolvedValue({consentId:'c',resourceId:'r'}),update:jest.fn()};
    const source={id:1,userId:'owner',sourceName:'7533',sourceType:'CREDIT_CARD',connectionRole:'primary'};
    states.manager={transaction:async callback=>callback({getRepository:entity=>entity===User?{findOne:async()=>({firebaseId:'owner'})}:entity===UserSyncState?states:entity===Source?{findOne:async()=>source}:rows})};
    const service=new UserSyncStateService(states,rows,{findOne:async()=>source} as any);
    const outcome:any={type:'card',sourceId:'7533',consentId:'c',resourceId:'r',status:'success',transactionCount:4,runId:'current'};
    await service.updateSourceResults('owner',[outcome]);
    expect(rows.update).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({resultRunId:'current'}));
    rows.update.mockClear();await service.updateSourceResults('owner',[{...outcome,runId:'previous'}]);
    expect(rows.update).not.toHaveBeenCalled();
  });
  it('returns only results tagged with this full pull, excluding old successes and skipped cards',async()=>{
    const controller=Object.create(TransactionsController.prototype) as any;
    const state:any={fullRunId:'current',fullProcessStatus:'completed'};
    const rows=[{sourceId:'7533',status:'success',resultRunId:'current'},
      {sourceId:'9081',status:'success',resultRunId:'old'},{sourceId:'0013',status:'skipped_direct',resultRunId:null}];
    controller.userSyncStateService={getSyncState:async()=>state,getSourceResults:async()=>rows};
    expect((await controller.getSyncStatus({user:{firebaseId:'owner'}})).sourceResults).toEqual([rows[0]]);
    state.fullSkipReason='cache_exists';
    expect((await controller.getSyncStatus({user:{firebaseId:'owner'}})).sourceResults).toEqual([]);
    delete state.fullSkipReason;state.fullRunId=null;
    expect((await controller.getSyncStatus({user:{firebaseId:'owner'}})).sourceResults).toEqual([]);
    state.fullRunId='current';state.fullProcessStatus='empty';
    expect((await controller.getSyncStatus({user:{firebaseId:'owner'}})).sourceResults).toEqual([]);
  });
  it('keeps another source outcome when one source transaction fails',async()=>{
    const states:any={findOne:async()=>({fullRunId:'current',fullStartedAt:when})};
    const rows:any={findOne:async()=>({consentId:'c',resourceId:'r'}),update:jest.fn().mockRejectedValueOnce(Error('write failed')).mockResolvedValue({affected:1})};
    const accounts:any={findOne:async({where})=>({id:where.id,userId:'owner',sourceName:where.id===1?'7533':'9081',sourceType:'CREDIT_CARD',connectionRole:'primary'})};
    states.manager={transaction:jest.fn(async callback=>callback({getRepository:entity=>entity===User?{findOne:async()=>({firebaseId:'owner'})}:entity===UserSyncState?states:entity===Source?accounts:rows}))};
    const service=new UserSyncStateService(states,rows,accounts);
    const incoming:any=[1,2].map(id=>({sourceRecordId:id,type:'card',sourceId:id===1?'7533':'9081',consentId:'c',resourceId:'r',status:'success',transactionCount:1,runId:'current'}));
    await expect(service.updateSourceResults('owner',incoming)).rejects.toMatchObject({completed:1});
    expect(states.manager.transaction).toHaveBeenCalledTimes(2);expect(rows.update).toHaveBeenCalledTimes(2);
  });
  it('does not let an old refresh overwrite the connection flag after newer per-source proof',async()=>{
    const users={findOne:async()=>({firebaseId:'owner'}),update:jest.fn()};
    const states={findOne:async()=>null,upsert:jest.fn()};
    const sourceRows={findOne:jest.fn().mockResolvedValue({id:2,consentVerifiedAt:new Date('2026-11-02')})};
    const root:any={manager:{transaction:async fn=>fn({getRepository:entity=>entity===User?users:entity===UserSourceSyncState?sourceRows:states})}};
    const service=new UserSyncStateService(root,sourceRows as any,{} as any);
    expect(await service.recordSourcesRefreshResult('owner',when,{complete:true,connected:false})).toBe(false);
    expect(states.upsert).not.toHaveBeenCalled();expect(users.update).not.toHaveBeenCalled();
  });
  it('does not let an older job finish or fail a newer job',async()=>{
    const current:any={fullRunId:'new',fullProcessStatus:'running'};
    const repo:any={update:jest.fn(async(criteria,patch)=>{
      if(criteria.fullRunId===current.fullRunId)Object.assign(current,patch);
    }),upsert:jest.fn()};
    const service=new UserSyncStateService(repo,{} as any,{} as any);
    await service.markSyncFinished('owner','completed','success',7,undefined,'old');
    await service.markSyncFailed('owner','old error','old');
    expect(current).toEqual({fullRunId:'new',fullProcessStatus:'running'});
    expect(repo.upsert).not.toHaveBeenCalled();
  });
  it('returns the original support error when cancellation pointer persistence fails',async()=>{
    const issue={code:'OB-02',errorId:'12345678-1234-1234-1234-123456789012',message:'save failed',partial:false};
    const service={disconnect:jest.fn().mockRejectedValue(new BankingBatchError([issue]))};
    const controller=new FeezbackController({} as any,{} as any,{} as any,{} as any,undefined,service as any);
    await expect(controller.disconnect({user:{firebaseId:'owner'}} as any,{scope:'all'})).rejects.toMatchObject({response:{supportError:{code:'OB-02',errorId:issue.errorId}}});
  });
  it('reuses the owned full-run identity for a retry batch instead of trying to acquire its own lock again',async()=>{
    jest.spyOn(console,'log').mockImplementation(()=>{});
    const source:any={type:'card',sourceId:'7533',sourceRecordId:1,consentId:'active-card',status:'success',transactionCount:1};
    const state:any={markSyncRunning:jest.fn().mockResolvedValue({acquired:false}),getSourceResults:jest.fn().mockResolvedValue([source])};
    const service=new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,{} as any,{} as any,{} as any,state,{} as any,{} as any,{} as any,{} as any);
    jest.spyOn(service,'retrySource').mockResolvedValue(source);
    const finish=jest.spyOn(service as any,'markConnectedSyncFinished').mockResolvedValue(undefined);
    await (service as any).pullRunScope.run('owned-run',()=> (service as any).retryFailedSources('owner',[source],'owner'));
    expect(state.markSyncRunning).not.toHaveBeenCalled();
    expect(service.retrySource).toHaveBeenCalledWith('owner','card','7533',1,'owned-run');
    expect(finish).toHaveBeenCalledWith('owner','completed','success',0,undefined,'owned-run');
  });
});
