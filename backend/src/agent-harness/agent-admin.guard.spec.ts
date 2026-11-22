import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AgentAdminGuard } from './agent-admin.guard';
import { AgentDomainService } from './agent-domain.service';
import { AgentHarnessController } from './agent-harness.controller';
import { AutoClassificationController } from '../auto-classification/auto-classification.controller';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
describe('AI admin boundary', () => {
  it.each([AgentHarnessController, AutoClassificationController])(
    'requires auth and persisted admin role on %p',
    (controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        FirebaseAuthGuard,
        AgentAdminGuard,
      ]);
    },
  );
  it('checks the actual actor in storage and fails closed for non-admin/missing actors', async () => {
    const findOne = jest.fn().mockResolvedValue({ role: ['REGULAR'] });
    const domain = new AgentDomainService(
      {} as any,
      {} as any,
      {} as any,
      { findOne } as any,
    );
    const guard = new AgentAdminGuard(domain);
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            actorFirebaseId: 'actor',
            firebaseId: 'admin-owner',
            role: ['ADMIN'],
          },
        }),
      }),
    };
    await expect(guard.canActivate(context)).rejects.toThrow('Admin access');
    expect(findOne).toHaveBeenCalledWith({ where: { firebaseId: 'actor' } });
    findOne.mockResolvedValue({ role: ['ADMIN'] });
    expect(await guard.canActivate(context)).toBe(true);
    await expect(domain.assertAiAdmin({ actorFirebaseId: '' })).rejects.toThrow(
      'Admin access',
    );
  });
});
