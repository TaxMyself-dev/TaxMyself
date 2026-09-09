import { ForbiddenException } from '@nestjs/common';
import { BusinessFieldType, OwnerType, RecognitionType } from 'src/enum';
import { AdminBookingAccountsController } from './admin-booking-accounts.controller';

describe('AdminBookingAccountsController', () => {
  const systemScope = {
    ownerType: OwnerType.SYSTEM,
    chartOwnerKey: 'SYSTEM',
  };

  const dto = {
    name: 'הוצאות בדיקה',
    sectionId: 12,
    vatPercent: 100,
    taxPercent: 75,
    reductionPercent: 0,
    isEquipment: false,
    recognitionType: RecognitionType.RECOGNIZED,
    technicalOnly: false,
    categoryName: 'משרד',
    type: 'expense' as const,
    visibleBusinessTypes: [BusinessFieldType.SERVICE_PROVIDER],
  };

  function setup(isAdmin = true) {
    const catalogService = {
      buildScope: jest.fn().mockReturnValue(systemScope),
      getSections: jest.fn().mockResolvedValue([
        { id: 12, code: '60000', name: 'הוצאות הנהלה' },
      ]),
      createAccountWithSubCategory: jest.fn().mockResolvedValue({
        account: {
          id: 91,
          code: '69990',
          name: dto.name,
          type: dto.type,
          sectionId: dto.sectionId,
          code6111: null,
          vatPercent: dto.vatPercent,
          taxPercent: dto.taxPercent,
          reductionPercent: dto.reductionPercent,
          isEquipment: dto.isEquipment,
          recognitionType: dto.recognitionType,
          reportScope: 'pnl',
          ownerType: OwnerType.SYSTEM,
          chartOwnerKey: 'SYSTEM',
          visibleBusinessTypes: dto.visibleBusinessTypes,
        },
        subCategory: {
          id: 92,
          name: dto.name,
          categoryId: 5,
          ownerType: OwnerType.SYSTEM,
          chartOwnerKey: 'SYSTEM',
          approvalStatus: 'APPROVED',
        },
      }),
    };
    const catalogContextService = {
      isAdmin: jest.fn().mockResolvedValue(isAdmin),
    };
    const controller = new AdminBookingAccountsController(
      catalogService as any,
      catalogContextService as any,
    );
    return { controller, catalogService, catalogContextService };
  }

  it('creates a new card in SYSTEM scope through the atomic catalog boundary', async () => {
    const { controller, catalogService } = setup();

    const result = await controller.create(
      { user: { firebaseId: 'admin-1' } } as any,
      dto,
    );

    expect(catalogService.buildScope).toHaveBeenCalledWith(OwnerType.SYSTEM, {});
    expect(catalogService.createAccountWithSubCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: systemScope,
        name: dto.name,
        categoryName: dto.categoryName,
        createdByUserId: 'admin-1',
      }),
    );
    expect(result.account).toEqual(expect.objectContaining({ ownerType: OwnerType.SYSTEM, chartOwnerKey: 'SYSTEM' }));
    expect(result.subCategory).toEqual(expect.objectContaining({ ownerType: OwnerType.SYSTEM, chartOwnerKey: 'SYSTEM' }));
  });

  it('lists only SYSTEM sections for the admin form', async () => {
    const { controller, catalogService } = setup();

    const result = await controller.sections({ user: { firebaseId: 'admin-1' } } as any);

    expect(catalogService.getSections).toHaveBeenCalledWith(['SYSTEM']);
    expect(result).toEqual([{ id: 12, code: '60000', name: 'הוצאות הנהלה' }]);
  });

  it('rejects non-admin actors', async () => {
    const { controller, catalogService } = setup(false);

    await expect(controller.create({ user: { firebaseId: 'accountant-1' } } as any, dto))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(catalogService.createAccountWithSubCategory).not.toHaveBeenCalled();
  });
});
