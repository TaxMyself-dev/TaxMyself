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
    expect(integrations.upsertIntegration).toHaveBeenCalledWith({ firebaseId: 'user-a', provider: IntegrationProvider.GOOGLE, accountId: 'google-sub', accountEmail: 'test@example.com', connectedAccountId: 'ca-a', connectionEnvironment: 'dev' });
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
    integrations.findOwnedByIdOrThrow.mockResolvedValue({ provider: IntegrationProvider.GOOGLE, connectedAccountId: 'ca-a', connectionEnvironment: 'dev' });
    composio.remove.mockRejectedValue(new Error('transient'));
    await expect(service.disconnect('user-a', 1)).rejects.toThrow();
    expect(integrations.disconnect).toHaveBeenCalledWith(1);
  });
});
