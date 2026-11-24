import { EmailConnectionsService } from './email-connections.service';
import { IntegrationProvider } from '../enums/integrations.enums';

describe('Email connection lifecycle without a live mailbox', () => {
  let composio: any;
  let states: any;
  let integrations: any;
  let service: EmailConnectionsService;
  const attempt = { firebaseId: 'user-a', connectedAccountId: 'ca-a', targetIntegrationId: null };
  beforeEach(() => {
    process.env.COMPOSIO_GMAIL_CALLBACK_URL = 'http://localhost:3000/integrations/google/callback';
    composio = { assertEnabled: jest.fn(), environment: jest.fn().mockReturnValue('dev'), link: jest.fn().mockResolvedValue({ id: 'ca-a', redirectUrl: 'https://connect.composio.dev/link/test' }), assertAccount: jest.fn(), execute: jest.fn().mockResolvedValue({ data: { sub: 'google-sub', email: 'test@example.com' } }), remove: jest.fn() };
    states = { createState: jest.fn().mockResolvedValue('single-use'), bindConnection: jest.fn(), consumeState: jest.fn().mockResolvedValue(attempt) };
    integrations = { upsertIntegration: jest.fn().mockResolvedValue({ id: 1 }), findOwnedByIdOrThrow: jest.fn(), disconnect: jest.fn(), finishRemoteDisconnect: jest.fn(), clearRetiredConnections: jest.fn() };
    service = new EmailConnectionsService(composio, states, integrations);
  });
  it('binds a server-created request to the connection attempt', async () => {
    await service.connect('user-a');
    expect(states.bindConnection).toHaveBeenCalledWith('single-use', 'ca-a', undefined);
    expect(composio.link).toHaveBeenCalledWith('user-a', expect.stringContaining('state=single-use'));
  });
  it('binds Outlook business selection to the Microsoft OAuth state',async()=>{
    process.env.COMPOSIO_OUTLOOK_CALLBACK_URL='http://localhost:3000/integrations/outlook/callback';
    const routing:any={connectionBusiness:jest.fn().mockResolvedValue('123456789')};
    const scoped=new EmailConnectionsService(composio,states,integrations,routing);
    await scoped.connect('user-a',undefined,'123456789',IntegrationProvider.MICROSOFT);
    expect(states.createState).toHaveBeenCalledWith('user-a',IntegrationProvider.MICROSOFT,null,'123456789');
    expect(composio.link).toHaveBeenCalledWith('user-a',expect.stringContaining('/outlook/callback'), 'outlook');
  });
  it('binds an owned business to single-use server state before linking Google',async()=>{
    const routing:any={connectionBusiness:jest.fn().mockResolvedValue('123456789')};
    const scoped=new EmailConnectionsService(composio,states,integrations,routing);
    await scoped.connect('user-a',undefined,'123456789');
    expect(routing.connectionBusiness).toHaveBeenCalledWith('user-a','123456789');
    expect(states.createState).toHaveBeenCalledWith('user-a',IntegrationProvider.GOOGLE,null,'123456789');
    expect(composio.link.mock.calls[0][1]).not.toContain('123456789');
  });
  it('does not open Google when business selection is missing or foreign',async()=>{
    const scoped=new EmailConnectionsService(composio,states,integrations,{connectionBusiness:jest.fn().mockRejectedValue(new Error('Select an owned business'))} as any);
    await expect(scoped.connect('user-a')).rejects.toThrow('owned business');
    expect(states.createState).not.toHaveBeenCalled();expect(composio.link).not.toHaveBeenCalled();
  });
  it('applies only the saved business on verified callback and rechecks ownership',async()=>{
    states.consumeState.mockResolvedValue({...attempt,businessNumber:'123456789'});
    const routing:any={connectionBusiness:jest.fn().mockResolvedValue('123456789')};
    await new EmailConnectionsService(composio,states,integrations,routing).complete('single-use','ca-a','success');
    expect(routing.connectionBusiness).toHaveBeenCalledTimes(2);
    expect(integrations.upsertIntegration).toHaveBeenCalledWith(expect.objectContaining({businessNumber:'123456789',firebaseId:'user-a'}));
  });
  it('rejects a business removed during Google consent before invoking provider tools',async()=>{
    states.consumeState.mockResolvedValue({...attempt,businessNumber:'deleted'});
    const routing:any={connectionBusiness:jest.fn().mockRejectedValue(new Error('Business removed'))};
    await expect(new EmailConnectionsService(composio,states,integrations,routing).complete('single-use','ca-a','success')).rejects.toThrow('removed');
    expect(composio.assertAccount).not.toHaveBeenCalled();expect(integrations.upsertIntegration).not.toHaveBeenCalled();
  });
  it('rejects forged callback account IDs before any tool execution', async () => {
    await expect(service.complete('single-use', 'ca-other', 'success')).rejects.toThrow();
    expect(composio.execute).not.toHaveBeenCalled();
  });
  it('does not treat a success query parameter as verified activation', async () => {
    composio.assertAccount.mockRejectedValue(new Error('inactive'));
    await expect(service.complete('single-use', 'ca-a', 'success')).rejects.toThrow();
    expect(integrations.upsertIntegration).not.toHaveBeenCalled();
  });
  it('persists only the verified identity and connection pointer', async () => {
    await service.complete('single-use', 'ca-a', 'success');
    expect(integrations.upsertIntegration).toHaveBeenCalledWith({ firebaseId: 'user-a', provider: IntegrationProvider.GOOGLE, accountId: 'google-sub', accountEmail: 'test@example.com', connectedAccountId: 'ca-a' });
  });
  it('rejects a different mailbox when reconnecting a selected row', async () => {
    states.consumeState.mockResolvedValue({ ...attempt, targetIntegrationId: 1 });
    integrations.findOwnedByIdOrThrow.mockResolvedValue({ accountId: 'another-sub' });
    await expect(service.complete('single-use', 'ca-a', 'success')).rejects.toThrow('different mailbox');
    expect(integrations.upsertIntegration).not.toHaveBeenCalled();
  });
  it('consumes cancellations without registering a connection', async () => {
    await expect(service.complete('single-use', 'ca-a', 'failed')).rejects.toThrow();
    expect(states.consumeState).toHaveBeenCalled();
    expect(composio.execute).not.toHaveBeenCalled();
  });
  it('blocks replayed or expired state', async () => {
    states.consumeState.mockRejectedValue(new Error('expired'));
    await expect(service.complete('old', 'ca-a', 'success')).rejects.toThrow();
    expect(composio.assertAccount).not.toHaveBeenCalled();
  });
  it('stops local reads even when remote revocation fails', async () => {
    integrations.findOwnedByIdOrThrow.mockResolvedValue({ provider: IntegrationProvider.GOOGLE, connectedAccountId: 'ca-a' });
    composio.remove.mockRejectedValue(new Error('transient'));
    await expect(service.disconnect('user-a', 1)).rejects.toThrow();
    expect(integrations.disconnect).toHaveBeenCalledWith(1);
  });
  it('creates provider-bound Outlook OAuth and saves verified Microsoft identity', async () => {
    process.env.COMPOSIO_OUTLOOK_CALLBACK_URL = 'http://localhost:3000/integrations/outlook/callback';
    await service.connect('user-a', undefined, undefined, IntegrationProvider.MICROSOFT);
    expect(states.createState).toHaveBeenCalledWith('user-a', IntegrationProvider.MICROSOFT);
    expect(composio.link).toHaveBeenCalledWith('user-a', expect.stringContaining('/outlook/callback?state='), 'outlook');
    composio.execute.mockResolvedValue({id:'ms-id',mail:'mail@example.com'});
    await service.complete('single-use', 'ca-a', 'success', IntegrationProvider.MICROSOFT);
    expect(states.consumeState).toHaveBeenCalledWith('single-use', IntegrationProvider.MICROSOFT);
    expect(composio.assertAccount).toHaveBeenCalledWith(expect.objectContaining({toolkit:'outlook'}));
    expect(integrations.upsertIntegration).toHaveBeenCalledWith(expect.objectContaining({provider:IntegrationProvider.MICROSOFT,accountId:'ms-id',accountEmail:'mail@example.com'}));
  });
  it('does not reconnect a Google row through Outlook', async () => {
    integrations.findOwnedByIdOrThrow.mockResolvedValue({provider:IntegrationProvider.GOOGLE});
    await expect(service.connect('user-a', 1, undefined, IntegrationProvider.MICROSOFT)).rejects.toThrow();
    expect(composio.link).not.toHaveBeenCalled();
  });
  it('revokes Outlook using its own toolkit context', async () => {
    integrations.findOwnedByIdOrThrow.mockResolvedValue({provider:IntegrationProvider.MICROSOFT,connectedAccountId:'ca-ms'});
    await service.disconnect('user-a',1);
    expect(composio.remove).toHaveBeenCalledWith(expect.objectContaining({toolkit:'outlook',connectedAccountId:'ca-ms'}));
  });

});
