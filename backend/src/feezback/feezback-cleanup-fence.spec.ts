import { FeezbackCacheCleanupService } from './feezback-cache-cleanup.service';
import { User } from '../users/user.entity';
import { Source } from '../transactions/source.entity';
import { UserSyncState } from '../transactions/user-sync-state.entity';

describe('Explicit cancellation cleanup observation fences',()=>{
  it.each(['connection','metadata','pointer'])('does not erase a newer %s after reading provider absence',async changed=>{
    const observedAt=new Date('2026-11-01T10:00:00Z'),newer=new Date('2026-11-01T11:00:00Z');
    const source={id:1,userId:'owner',connectionRole:'primary',metadataVerifiedAt:changed==='metadata'?newer:null};
    const manager:any={getRepository:entity=>entity===User?{findOne:async()=>({firebaseId:'owner'})}:
      entity===Source?{find:async()=>[source],findOne:async()=>source}:
      entity===UserSyncState?{findOne:async()=>({lastSourcesRefreshAttemptAt:changed==='connection'?newer:null})}:
      {findOne:async()=>({consentId:changed==='pointer'?'new-active':null})},update:jest.fn(),delete:jest.fn()};
    const service=new FeezbackCacheCleanupService({transaction:async fn=>fn(manager)} as any);
    await expect(service.cleanup('owner',{observedAt,complete:true,consents:[],errors:[],sources:[{sourceRecordId:1,connectionRole:'primary',consentId:'old'}]})).rejects.toThrow();
    expect(manager.update).not.toHaveBeenCalled();expect(manager.delete).not.toHaveBeenCalled();
  });
});
