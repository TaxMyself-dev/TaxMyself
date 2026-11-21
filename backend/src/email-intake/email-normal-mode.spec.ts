import { EmailIntakeRunsService } from './email-intake-runs.service';
import { EmailIntakeStore } from './email-intake.store';
describe('normal email availability and queries',()=>{
 function setup(){const store={enabled:()=>true,createRun:jest.fn(async x=>x)};const importer={resolveEmailBusiness:jest.fn(async()=> 'business')};return {store,service:new EmailIntakeRunsService(store as any,{} as any,{} as any,importer as any,{} as any),account:{id:42,firebaseId:'owner',status:'ACTIVE',connectionBackend:'COMPOSIO'} as any};}
 it('freezes the normal broad query rather than the old DEV test subject',async()=>{const t=setup();const run=await t.service.start(t.account,{type:'MANUAL'});expect(run.query).toMatch(/^has:attachment after:\d+ before:\d+$/);expect(run.query).not.toContain('KEEPINTAX-DEV');expect(run.integrationId).toBe(42);expect(run.business).toBe('business');});
 it('preserves explicit fixed queries and owner/business routing',async()=>{const t=setup();const query='has:attachment from:supplier@example.test after:100 before:200';const run=await t.service.start(t.account,{query});expect(run.query).toBe(query);expect(run.owner).toBe('owner');});
 it('retains inactive-account rejection before run creation',async()=>{const t=setup();t.account.status='EXPIRED';await expect(t.service.start(t.account,{})).rejects.toThrow('unavailable');expect(t.store.createRun).not.toHaveBeenCalled();});
 it('enumerates eligible work without test-run filters',async()=>{const db={query:jest.fn(async()=>[])};await new EmailIntakeStore(db as any).dueWork();expect(db.query).toHaveBeenCalledWith(expect.not.stringContaining('query_text'),[]);});
});
