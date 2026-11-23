import { EmailIntakeRunsService } from './email-intake-runs.service';
import { EmailProviderError } from '../integrations/providers/email-provider.error';

function setup(category: any, attempts=0, localStatus='ACTIVE') {
  const run:any={id:'run-safe',firebase_id:'owner',business_number:'business',integration_id:19,sync_type:'INITIAL',scan_state:'READY',attempts};
  const query=jest.fn().mockImplementation(async(sql:string)=>sql.startsWith('SELECT')?[{...run,page_token:null}]:{affectedRows:1});
  const store:any={enabled:()=>true,leaseRun:jest.fn().mockResolvedValue('lease'),items:jest.fn().mockResolvedValue([]),summary:jest.fn().mockResolvedValue({messages:{},attachments:{}}),query};
  const reader:any={durablePage:jest.fn().mockRejectedValue(new EmailProviderError(category,{httpStatus:403}))};
  const integrations:any={findOwnedByIdOrThrow:jest.fn().mockResolvedValue({id:19,status:localStatus,lastSyncStatus:'RUNNING'}),markSyncError:jest.fn(),markSyncRunning:jest.fn(),markSyncSuccess:jest.fn()};
  const service=new EmailIntakeRunsService(store,reader,integrations,{} as any,{} as any);
  return {run,store,reader,integrations,service};
}
describe('durable failure transitions and safe diagnostics',()=>{
  it.each([['AUTH','EMAIL_RECONNECT_REQUIRED'],['ACCESS','EMAIL_ACCESS_DENIED'],['CONFIG','EMAIL_CONFIGURATION']])('ends active pull on %s without advancing the cursor',async(category,code)=>{
    const t=setup(category);await t.service.step(t.run);
    expect(t.store.query).toHaveBeenCalledWith(expect.stringContaining('SET pull_state=?'),['PARTIAL',category,'PARTIAL','run-safe','lease']);
    expect(t.integrations.markSyncError).toHaveBeenCalledWith(19,code);
    expect(t.integrations.markSyncSuccess).not.toHaveBeenCalled();
    expect(t.store.query).toHaveBeenLastCalledWith(expect.stringContaining('SET lease_token=NULL'),['run-safe','lease']);
  });
  it('schedules a temporary failure and clears the misleading RUNNING account state',async()=>{
    const t=setup('TRANSIENT');await t.service.step(t.run);
    expect(t.store.query).toHaveBeenCalledWith(expect.stringContaining('SET pull_state=?'),['RETRY','TRANSIENT','RETRY','run-safe','lease']);
    expect(t.integrations.markSyncError).toHaveBeenCalledWith(19,'EMAIL_RETRY_PENDING');
  });
  it('bounds repeated run failures',async()=>{const t=setup('TRANSIENT',4);await t.service.step(t.run);expect(t.integrations.markSyncError).toHaveBeenCalledWith(19,'EMAIL_RETRY_EXHAUSTED');expect(t.store.query).toHaveBeenCalledWith(expect.stringContaining('SET pull_state=?'),['PARTIAL','TRANSIENT','PARTIAL','run-safe','lease']);});
  it('marks a resumed active connection RUNNING before its bounded retry',async()=>{const t=setup('TRANSIENT');t.integrations.findOwnedByIdOrThrow.mockResolvedValue({id:19,status:'ACTIVE',lastSyncStatus:'ERROR'});await t.service.step(t.run);expect(t.integrations.markSyncRunning).toHaveBeenCalledWith(19);});
  it('does not keep attempting mailbox reads for a locally expired account',async()=>{const t=setup('AUTH',0,'EXPIRED');await t.service.step(t.run);expect(t.reader.durablePage).not.toHaveBeenCalled();expect(t.integrations.markSyncError).toHaveBeenCalledWith(19,'EMAIL_CONNECTION_UNVERIFIED');});
  it('logs the failed stage and safe code without owner, query or raw payload',async()=>{const t=setup('ACCESS');const warn=jest.spyOn((t.service as any).logger,'warn').mockImplementation(()=>{});await t.service.step(t.run);const logs=JSON.stringify(warn.mock.calls);expect(logs).toContain('list_messages');expect(logs).toContain('run-safe');expect(logs).not.toContain('owner');expect(logs).not.toContain('business');});
  it('does not overwrite integration state after losing the run lease',async()=>{const t=setup('ACCESS');t.store.query.mockImplementation(async(sql:string)=>sql.startsWith('SELECT')?[t.run]:{affectedRows:0});await t.service.step(t.run);expect(t.integrations.markSyncError).not.toHaveBeenCalled();});

});
