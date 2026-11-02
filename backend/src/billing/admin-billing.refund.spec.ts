import { AdminBillingController } from './admin-billing.controller';
import { ForbiddenException } from '@nestjs/common';

describe('Admin refund authorization', () => {
  it.each(['refundContext', 'createRefund', 'resolveRefund', 'checkRefundProvider'])( 'rejects a non-admin actor for %s even when impersonating an admin subject', async method => {
    const users = { isAdmin: jest.fn().mockResolvedValue(false) };
    const refunds = { context: jest.fn(), create: jest.fn(), resolve: jest.fn() };
    const controller = new AdminBillingController({} as any, users as any, undefined, refunds as any);
    await expect((controller as any)[method]({ user: { firebaseId: 'admin-subject', actorFirebaseId: 'non-admin-actor' } }, 7, 9, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.isAdmin).toHaveBeenCalledWith('non-admin-actor');
    expect(refunds.context).not.toHaveBeenCalled(); expect(refunds.create).not.toHaveBeenCalled(); expect(refunds.resolve).not.toHaveBeenCalled();
  });
  it('records the real admin actor when performing a refund', async () => {
    const refunds = { create: jest.fn().mockResolvedValue({ status: 'COMPLETED' }) };
    const controller = new AdminBillingController({} as any, { isAdmin: async () => true } as any, undefined, refunds as any);
    const dto = { requestId: 'request', paymentEventId: 1, amountAgorot: 100, reason: 'test reason' };
    await controller.createRefund({ user: { actorFirebaseId: 'admin-actor', firebaseId: 'represented-owner' } } as any, 7, dto);
    expect(refunds.create).toHaveBeenCalledWith(7, 'admin-actor', dto);
  });
});
