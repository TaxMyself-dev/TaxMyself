import { ForbiddenException } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { REQUIRED_DELEGATION_SCOPE_KEY } from 'src/decorators/required-delegation-scope.decorator';
import { DelegationScope } from 'src/delegation/delegation.entity';

describe('BusinessController delegated accountant writes', () => {
  const dto = { id: 17, advanceTaxPercent: 12 } as any;

  function setup() {
    const businessService = {
      updateBusiness: jest.fn().mockResolvedValue({ id: 17, advanceTaxPercent: 12 }),
      createBusiness: jest.fn(),
      deleteBusiness: jest.fn(),
      getUserBusinesses: jest.fn(),
    };
    return {
      controller: new BusinessController(businessService as any),
      businessService,
    };
  }

  it('updates the represented client business using the guard-swapped client identity', async () => {
    const { controller, businessService } = setup();

    await controller.updateBusiness(
      { user: { role: 'agent', firebaseId: 'client-firebase-id', actorFirebaseId: 'accountant-firebase-id' } } as any,
      dto,
    );

    expect(businessService.updateBusiness).toHaveBeenCalledWith('client-firebase-id', dto);
  });

  it('requires only an active delegation, including production view-only relationships', () => {
    expect(Reflect.getMetadata(
      REQUIRED_DELEGATION_SCOPE_KEY,
      BusinessController.prototype.updateBusiness,
    )).toBe(DelegationScope.DOCUMENTS_READ);
  });

  it('keeps business creation and deletion forbidden for accountants', async () => {
    const { controller } = setup();
    const request = { user: { role: 'agent', firebaseId: 'client-firebase-id' } } as any;

    await expect(controller.createBusiness(request, {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.deleteBusiness(request, 17)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
