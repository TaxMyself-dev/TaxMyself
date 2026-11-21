import { GmailSyncCronService } from './gmail-sync-cron.service';
describe('Gmail nightly synchronization', () => {
  it('runs the eligible-account flow without activation switches and retains outcome counts', async () => {
    const candidates=[{id:17},{id:18},{id:19}];
    const integrations={findGmailSyncCandidates:jest.fn().mockResolvedValue(candidates)};
    const sync={runIncrementalSync:jest.fn().mockResolvedValueOnce({outcome:'success'}).mockResolvedValueOnce({outcome:'skipped'}).mockResolvedValueOnce({outcome:'error'})};
    const service=new GmailSyncCronService(integrations as any,sync as any);
    expect(await service.processEligibleSyncs()).toEqual({eligible:3,succeeded:1,skipped:1,errors:1});
    expect(sync.runIncrementalSync).toHaveBeenCalledTimes(3);
    for(const candidate of candidates)expect(sync.runIncrementalSync).toHaveBeenCalledWith(candidate);
  });
  it('processes no more than three eligible connections concurrently',async()=>{
    let active=0,peak=0;
    const integrations={findGmailSyncCandidates:async()=>Array.from({length:7},(_,id)=>({id}))};
    const sync={runIncrementalSync:jest.fn(async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return {outcome:'success'};})};
    const service=new GmailSyncCronService(integrations as any,sync as any);
    expect(await service.processEligibleSyncs()).toEqual({eligible:7,succeeded:7,skipped:0,errors:0});expect(peak).toBe(3);
  });
});
