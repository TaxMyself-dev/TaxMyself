import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MODULE_KEY } from 'src/decorators/require-module.decorator';
import { ModuleName } from 'src/enum';
import { SubscriptionGuard } from './subscription.guard';

describe('SubscriptionGuard professional-access context', () => {
  let billingService: { hasModuleAccess: jest.Mock };
  let guard: SubscriptionGuard;

  beforeEach(() => {
    billingService = { hasModuleAccess: jest.fn().mockResolvedValue(true) };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(ModuleName.EXPENSES),
    } as unknown as Reflector;
    guard = new SubscriptionGuard(reflector, billingService as any);
  });

  function context(user: Record<string, unknown>, requestFlags: Record<string, unknown> = {}) {
    const request = { user, ...requestFlags };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as any;
  }

  it('passes verified admin impersonation separately to backend module enforcement', async () => {
    await expect(
      guard.canActivate(context(
        { firebaseId: 'expired-client' },
        { isAdminImpersonation: true },
      )),
    ).resolves.toBe(true);

    expect(billingService.hasModuleAccess).toHaveBeenCalledWith(
      'expired-client',
      ModuleName.EXPENSES,
      false,
      true,
    );
  });

  it('keeps direct client access free of either override', async () => {
    billingService.hasModuleAccess.mockResolvedValue(false);

    await expect(
      guard.canActivate(context({ firebaseId: 'expired-client' })),
    ).rejects.toThrow(ForbiddenException);

    expect(billingService.hasModuleAccess).toHaveBeenCalledWith(
      'expired-client',
      ModuleName.EXPENSES,
      false,
      false,
    );
  });

  it('preserves the existing delegated-access override', async () => {
    await expect(
      guard.canActivate(context(
        { firebaseId: 'delegated-client' },
        { isDelegatedAccess: true },
      )),
    ).resolves.toBe(true);

    expect(billingService.hasModuleAccess).toHaveBeenCalledWith(
      'delegated-client',
      ModuleName.EXPENSES,
      true,
      false,
    );
  });
});
