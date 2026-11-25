import { GmailSyncService } from './services/gmail-sync.service';
import { IntegrationsController } from './integrations.controller';

describe('Mailbox owner-only controller', () => {
  let connections: any;
  let controller: IntegrationsController;
  beforeEach(() => {
    connections = { connect: jest.fn(), complete: jest.fn(), disconnect: jest.fn() };
    controller = new IntegrationsController(connections, {} as any, {} as any, {} as any, {} as any);
  });

  it('creates Outlook connections only for owners and validates reconnect IDs', async () => {
    await controller.connectOutlook({user:{firebaseId:'owner'}} as any,'42');
    expect(connections.connect).toHaveBeenCalledWith('owner',42,undefined,'MICROSOFT');
    await controller.connectOutlook({user:{firebaseId:'owner'}} as any,'42','123456789');
    expect(connections.connect).toHaveBeenCalledWith('owner',42,'123456789','MICROSOFT');
    await expect(controller.connectOutlook({user:{firebaseId:'owner'}} as any,'42',' ')).rejects.toThrow('Invalid connection business');
    await expect(controller.connectOutlook({user:{firebaseId:'client'},isDelegatedAccess:true} as any)).rejects.toThrow('owner');
    await expect(controller.connectOutlook({user:{firebaseId:'owner'}} as any,'NaN')).rejects.toThrow();
  });
  it('returns Outlook callback state without exposing connection identifiers', async () => {
    process.env.OUTLOOK_FRONTEND_URL='http://localhost:4200/settings?tab=permissions';
    const res={redirect:jest.fn()};
    await controller.outlookCallback(res as any,'ca-ms','success','opaque');
    expect(connections.complete).toHaveBeenCalledWith('opaque','ca-ms','success','MICROSOFT');
    const url=new URL(res.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('outlookIntegration')).toBe('success');
    expect(url.searchParams.has('state')).toBe(false);
  });
  it('does not let a represented client request create a mailbox connection', async () => {
    await expect(controller.connect({ user: { firebaseId: 'client', actorFirebaseId: 'accountant' }, isDelegatedAccess: true } as any)).rejects.toThrow('owner');
    expect(connections.connect).not.toHaveBeenCalled();
  });
  it('does not let admin impersonation read mailbox attachments', async () => {
    await expect(controller.gmailAttachments({ user: { firebaseId: 'client', actorFirebaseId: 'admin' }, isAdminImpersonation: true } as any, 1)).rejects.toThrow('owner');
  });
  it('does not accept malformed reconnect targets', async () => {
    await expect(controller.connect({ user: { firebaseId: 'owner', actorFirebaseId: 'owner' } } as any, 'NaN')).rejects.toThrow();
    expect(connections.connect).not.toHaveBeenCalled();
  });
  it('passes the selected business to the server-owned OAuth attempt',async()=>{
    await controller.connect({user:{firebaseId:'owner'}} as any,undefined,'123456789');
    expect(connections.connect).toHaveBeenCalledWith('owner',undefined,'123456789');
    await expect(controller.connect({user:{firebaseId:'owner'}} as any,undefined,' ')).rejects.toThrow();
  });
  it('keeps mailbox routing reads and writes owner-only',async()=>{
    const routing:any={get:jest.fn(),save:jest.fn()};
    const guarded=new IntegrationsController(connections,{} as any,{} as any,{} as any,{} as any,undefined,routing);
    const represented:any={user:{firebaseId:'client',actorFirebaseId:'agent'},isDelegatedAccess:true};
    await expect(guarded.routing(represented,17)).rejects.toThrow('owner');
    await expect(guarded.saveRouting(represented,17,{rules:[]})).rejects.toThrow('owner');
    expect(routing.get).not.toHaveBeenCalled();expect(routing.save).not.toHaveBeenCalled();
    await guarded.saveRouting({user:{firebaseId:'owner'}} as any,17,{rules:[]});
    expect(routing.save).toHaveBeenCalledWith('owner',17,{rules:[]});
  });
  it('constructs callback redirects with correct query delimiters', async () => {
    process.env.GMAIL_FRONTEND_URL = 'http://localhost:4200/settings?tab=permissions';
    const response = { redirect: jest.fn() };
    await controller.callback(response as any, 'ca-a', 'success', 'opaque');
    const url = new URL(response.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('tab')).toBe('permissions');
    expect(url.searchParams.get('googleIntegration')).toBe('success');
    expect(url.searchParams.has('state')).toBe(false);
  });
});


describe('Manual Gmail date range', () => {
  const owner = { user: { firebaseId: 'owner' } } as any;
  let controller: IntegrationsController;
  let runs: any;
  let fallback: any;
  let sync: any;
  beforeEach(() => {
    runs = { enabled: () => true, startManual: jest.fn().mockResolvedValue({started:true}) };
    fallback = { importAllForUser: jest.fn() };
    sync = new GmailSyncService({} as any, {} as any);
    jest.spyOn(sync, 'getMinFromDate').mockReturnValue('2025-01-01');
    jest.spyOn(sync, 'getMaxToDate').mockReturnValue('2026-11-21');
    controller = new IntegrationsController({} as any, {} as any, {} as any, fallback, sync, runs);
  });
  it('sends the inclusive date query to every selected account', async () => {
    await controller.gmailImport(owner, {integrationIds:[1,2],fromDate:'2025-01-01',toDate:'2026-11-21'});
    expect(runs.startManual).toHaveBeenCalledWith('owner',[1,2],{businessNumber:undefined,query:'after:2025/01/01 before:2026/11/22'});
  });
  it.each([
    {fromDate:'2025-01-01'}, {toDate:'2026-11-21'},
    {fromDate:'2024-12-31',toDate:'2025-01-01'},
    {fromDate:'2025-01-01',toDate:'2026-11-22'},
    {fromDate:'2026-02-30',toDate:'2026-03-01'},
    {fromDate:'2026-02-02',toDate:'2026-02-01'},
    {fromDate:'2025-01-01',toDate:'2026-11-21',q:'in:anywhere'},
    {fromDate:'',toDate:'2026-11-21'},
  ])('rejects invalid/ambiguous range before scheduling: %j', async dates => {
    await expect(controller.gmailImport(owner,{integrationIds:[1,2],...dates})).rejects.toThrow();
    expect(runs.startManual).not.toHaveBeenCalled();
    expect(fallback.importAllForUser).not.toHaveBeenCalled();
  });
  it('uses identical range validation and query on the legacy path', async () => {
    runs.enabled = () => false;
    await controller.gmailImport(owner,{integrationIds:[1],fromDate:'2025-12-31',toDate:'2025-12-31'});
    expect(fallback.importAllForUser).toHaveBeenCalledWith('owner',[1],expect.objectContaining({query:'after:2025/12/31 before:2026/01/01'}));
  });
  it('preserves the no-date API fallback for existing clients', async () => {
    await controller.gmailImport(owner,{integrationIds:[1]});
    expect(runs.startManual).toHaveBeenCalledWith('owner',[1],{businessNumber:undefined,query:undefined});
  });
});
