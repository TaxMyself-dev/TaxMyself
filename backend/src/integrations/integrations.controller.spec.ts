import { IntegrationsController } from './integrations.controller';

describe('Mailbox owner-only controller', () => {
  let connections: any;
  let controller: IntegrationsController;
  beforeEach(() => {
    connections = { connect: jest.fn(), complete: jest.fn(), disconnect: jest.fn() };
    controller = new IntegrationsController(connections, {} as any, {} as any, {} as any, {} as any);
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
