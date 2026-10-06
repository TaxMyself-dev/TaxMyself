import { ForbiddenException } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';

describe('TransactionsController admin sync-if-empty', () => {
  const buildController = (options?: {
    isAdmin?: boolean;
    state?: any;
  }) => {
    const usersService = {
      isAdmin: jest.fn().mockResolvedValue(options?.isAdmin ?? true),
      findFireUser: jest.fn().mockResolvedValue({ hasOpenBanking: true }),
    };
    const userSyncStateService = {
      getSyncState: jest.fn().mockResolvedValue(options?.state ?? null),
    };
    const feezbackService = {
      triggerFullSync: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new TransactionsController(
      {} as any,
      {} as any,
      {} as any,
      userSyncStateService as any,
      usersService as any,
      feezbackService as any,
      {} as any,
      {} as any,
    );

    return { controller, usersService, userSyncStateService, feezbackService };
  };

  const request = { user: { firebaseId: 'admin-user' } } as any;

  it('starts a login-style sync when the target cache state is empty', async () => {
    const { controller, feezbackService } = buildController({
      state: { fullProcessStatus: 'empty' },
    });

    await expect(controller.adminSyncUserIfEmpty(request, 'client-user'))
      .resolves.toEqual({ status: 'started' });
    expect(feezbackService.triggerFullSync).toHaveBeenCalledWith('client-user', 'login');
  });

  it('does not refresh a completed cache merely because the admin opens it', async () => {
    const { controller, feezbackService } = buildController({
      state: { fullProcessStatus: 'completed' },
    });

    await expect(controller.adminSyncUserIfEmpty(request, 'client-user'))
      .resolves.toEqual({ status: 'not_needed' });
    expect(feezbackService.triggerFullSync).not.toHaveBeenCalled();
  });

  it('reuses an in-flight sync', async () => {
    const { controller, feezbackService } = buildController({
      state: { fullProcessStatus: 'running' },
    });

    await expect(controller.adminSyncUserIfEmpty(request, 'client-user'))
      .resolves.toEqual({ status: 'already_running' });
    expect(feezbackService.triggerFullSync).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    const { controller, feezbackService } = buildController({ isAdmin: false });

    await expect(controller.adminSyncUserIfEmpty(request, 'client-user'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(feezbackService.triggerFullSync).not.toHaveBeenCalled();
  });

  it('does not start Feezback for a client without open banking', async () => {
    const context = buildController();
    context.usersService.findFireUser.mockResolvedValue({ hasOpenBanking: false });

    await expect(context.controller.adminSyncUserIfEmpty(request, 'client-user'))
      .resolves.toEqual({ status: 'not_needed' });
    expect(context.feezbackService.triggerFullSync).not.toHaveBeenCalled();
  });
});
