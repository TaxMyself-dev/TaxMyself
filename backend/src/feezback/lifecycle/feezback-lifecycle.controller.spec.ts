import { FeezbackLifecycleController } from './feezback-lifecycle.controller';

describe('Feezback admin authorization', () => {
  let controller: FeezbackLifecycleController, lifecycle: any, users: any;
  beforeEach(() => {
    lifecycle = { list: jest.fn(), request: jest.fn() };
    users = { isAdmin: jest.fn().mockResolvedValue(false) };
    controller = new FeezbackLifecycleController(lifecycle, users);
  });
  it('rejects delegated access to an admin identity when the real caller is not admin', async () => {
    await expect(
      controller.list({
        user: { firebaseId: 'admin-client', actorFirebaseId: 'accountant' },
      } as any),
    ).rejects.toThrow();
    expect(users.isAdmin).toHaveBeenCalledWith('accountant');
    expect(lifecycle.list).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation before manual termination', async () => {
    users.isAdmin.mockResolvedValue(true);
    await expect(
      controller.disconnect(
        { user: { firebaseId: 'admin' } } as any,
        'owner',
        {},
      ),
    ).rejects.toThrow();
    expect(lifecycle.request).not.toHaveBeenCalled();
  });
  it('bounds pagination and permits the real admin to queue a verified manual action', async () => {
    users.isAdmin.mockResolvedValue(true);
    const req = {
      user: { firebaseId: 'client', actorFirebaseId: 'admin' },
    } as any;
    await expect(controller.list(req, '0', '1000')).rejects.toThrow();
    await controller.disconnect(req, 'owner', { confirm: true });
    expect(lifecycle.request).toHaveBeenCalledWith('owner', true, 'admin');
  });
});
