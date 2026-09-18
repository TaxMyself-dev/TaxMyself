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
      previewNextSystemAccountCode: jest.fn().mockResolvedValue('60030'),
      previewNextSystemExpenseSectionCode: jest.fn().mockResolvedValue('61400'),
      createSystemExpenseSection: jest.fn().mockResolvedValue({ id: 33, code: '61400', name: 'ספקים' }),
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

  it('previews the next code for the selected SYSTEM section', async () => {
    const { controller, catalogService } = setup();

    await expect(controller.nextSectionCode(
      { user: { firebaseId: 'admin-1' } } as any,
      12,
    )).resolves.toEqual({ code: '60030' });
    expect(catalogService.previewNextSystemAccountCode).toHaveBeenCalledWith(12);
  });

  it('previews and creates an admin-only SYSTEM expense section', async () => {
    const { controller, catalogService } = setup();
    const request = { user: { firebaseId: 'admin-1' } } as any;
    await expect(controller.nextNewSectionCode(request)).resolves.toEqual({ code: '61400' });
    await expect(controller.createSection(request, { name: 'ספקים', code: '61400' })).resolves
      .toEqual({ id: 33, code: '61400', name: 'ספקים' });
    expect(catalogService.createSystemExpenseSection).toHaveBeenCalledWith('ספקים', '61400');
  });

  it('rejects non-admin section creation', async () => {
    const { controller, catalogService } = setup(false);
    await expect(controller.createSection(
      { user: { firebaseId: 'accountant-1' } } as any,
      { name: 'ספקים', code: '61400' },
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(catalogService.createSystemExpenseSection).not.toHaveBeenCalled();
  });

  it('rejects non-admin actors', async () => {
    const { controller, catalogService } = setup(false);

    await expect(controller.create({ user: { firebaseId: 'accountant-1' } } as any, dto))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(catalogService.createAccountWithSubCategory).not.toHaveBeenCalled();
  });
});
