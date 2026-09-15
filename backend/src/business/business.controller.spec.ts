import { ForbiddenException } from '@nestjs/common';
import { BusinessController } from './business.controller';

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

  it('keeps business creation and deletion forbidden for accountants', async () => {
    const { controller } = setup();
    const request = { user: { role: 'agent', firebaseId: 'client-firebase-id' } } as any;

    await expect(controller.createBusiness(request, {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.deleteBusiness(request, 17)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
