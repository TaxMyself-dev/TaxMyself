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
});
