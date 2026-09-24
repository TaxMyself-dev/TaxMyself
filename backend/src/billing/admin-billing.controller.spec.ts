import { ForbiddenException } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingService } from './services/admin-billing.service';
import { UsersService } from 'src/users/users.service';

describe('AdminBillingController.updateSubscriptionTrialEnd', () => {
  let controller: AdminBillingController;
  let adminBillingService: { updateSubscriptionTrialEnd: jest.Mock };
  let usersService: { isAdmin: jest.Mock };

  beforeEach(() => {
    adminBillingService = {
      updateSubscriptionTrialEnd: jest.fn().mockResolvedValue({
        subscriptionId: 42,
        trialEnd: new Date('2026-09-10'),
        status: 'TRIAL',
      }),
    };
    usersService = { isAdmin: jest.fn() };
    controller = new AdminBillingController(
      adminBillingService as unknown as AdminBillingService,
      usersService as unknown as UsersService,
    );
  });

  it('rejects a non-admin before the trial-end service operation runs', async () => {
    usersService.isAdmin.mockResolvedValue(false);

    await expect(
      controller.updateSubscriptionTrialEnd(
        { user: { firebaseId: 'regular-user' } } as any,
        42,
        { trialEnd: '2026-09-10' },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(usersService.isAdmin).toHaveBeenCalledWith('regular-user');
    expect(adminBillingService.updateSubscriptionTrialEnd).not.toHaveBeenCalled();
  });

  it('returns the updated date and status for an admin', async () => {
    usersService.isAdmin.mockResolvedValue(true);

    const result = await controller.updateSubscriptionTrialEnd(
      { user: { firebaseId: 'admin-user' } } as any,
      42,
      { trialEnd: '2026-09-10' },
    );

    expect(adminBillingService.updateSubscriptionTrialEnd).toHaveBeenCalledWith(42, {
      trialEnd: '2026-09-10',
    });
    expect(result).toEqual(expect.objectContaining({ status: 'TRIAL' }));
  });

  /**
   * KT-038 Task 2: FirebaseAuthGuard rewrites request.user.firebaseId to the
   * selected client's id during accountant delegation. If a non-admin
   * accountant holds an ACTIVE delegation to a client who happens to hold
   * the ADMIN role, request.user.firebaseId becomes that admin's id. Using
   * it (instead of the never-rewritten actorFirebaseId) to decide admin
   * access would let the accountant escalate to full admin-billing control —
   * this is the exact privilege-escalation bug this fix closes.
   */
  it('rejects a delegated accountant whose rewritten firebaseId belongs to an admin, checking the real actor instead', async () => {
    usersService.isAdmin.mockImplementation((firebaseId: string) =>
      Promise.resolve(firebaseId === 'admin-client'),
    );

    await expect(
      controller.updateSubscriptionTrialEnd(
        {
          user: { firebaseId: 'admin-client', actorFirebaseId: 'accountant-1' },
          isDelegatedAccess: true,
        } as any,
        42,
        { trialEnd: '2026-09-10' },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(usersService.isAdmin).toHaveBeenCalledWith('accountant-1');
    expect(usersService.isAdmin).not.toHaveBeenCalledWith('admin-client');
    expect(adminBillingService.updateSubscriptionTrialEnd).not.toHaveBeenCalled();
  });

  it('allows a genuine admin whose actorFirebaseId is not rewritten (no delegation in play)', async () => {
    usersService.isAdmin.mockImplementation((firebaseId: string) =>
      Promise.resolve(firebaseId === 'admin-user'),
    );

    await controller.updateSubscriptionTrialEnd(
      { user: { firebaseId: 'admin-user', actorFirebaseId: 'admin-user' } } as any,
      42,
      { trialEnd: '2026-09-10' },
    );

    expect(usersService.isAdmin).toHaveBeenCalledWith('admin-user');
    expect(adminBillingService.updateSubscriptionTrialEnd).toHaveBeenCalledWith(42, {
      trialEnd: '2026-09-10',
    });
  });
});

describe('AdminBillingController.getUnresolvedBillingAttempts', () => {
  it('keeps the unresolved-attempt read endpoint admin-only', async () => {
    const adminBillingService = { findUnresolvedBillingAttempts: jest.fn().mockResolvedValue([]) };
    const usersService = { isAdmin: jest.fn().mockResolvedValue(false) };
    const controller = new AdminBillingController(
      adminBillingService as unknown as AdminBillingService,
      usersService as unknown as UsersService,
    );

    await expect(
      controller.getUnresolvedBillingAttempts({ user: { firebaseId: 'regular-user' } } as any, 42),
    ).rejects.toThrow(ForbiddenException);
    expect(adminBillingService.findUnresolvedBillingAttempts).not.toHaveBeenCalled();

    usersService.isAdmin.mockResolvedValue(true);
    await controller.getUnresolvedBillingAttempts({ user: { firebaseId: 'admin-user' } } as any, 42);
    expect(adminBillingService.findUnresolvedBillingAttempts).toHaveBeenCalledWith(42);
  });
});
