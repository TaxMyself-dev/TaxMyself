import { ExpensesService } from './expenses.service';
import { Supplier } from './suppliers.entity';

describe('ExpensesService supplier account percentages', () => {
  const context = {
    userId: 'user-1',
    businessNumber: '123456789',
    accountantIds: [],
    businessType: null,
  };

  let supplierRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let catalogService: { resolveSubCategory: jest.Mock };
  let catalogContextService: { forUser: jest.Mock };
  let service: ExpensesService;

  beforeEach(() => {
    supplierRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => value),
    };
    catalogService = {
      resolveSubCategory: jest.fn().mockResolvedValue({
        account: { id: 10, code: '61100' },
        vatPercent: '66.67',
        taxPercent: '45.00',
      }),
    };
    catalogContextService = {
      forUser: jest.fn().mockResolvedValue(context),
    };

    service = new ExpensesService(
      {} as any,
      {} as any,
      {} as any,
      supplierRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      catalogService as any,
      catalogContextService as any,
    );
  });

  it('uses the linked booking account percentages when adding a supplier', async () => {
    supplierRepo.findOne.mockResolvedValue(null);

    await service.addSupplier({
      supplier: 'Supplier',
      supplierID: ' 5151540809 ',
      subCategoryId: 42,
      vatPercent: 67,
      taxPercent: 46,
    } as Partial<Supplier>, 'user-1', '123456789');

    expect(catalogContextService.forUser).toHaveBeenCalledWith('user-1', '123456789');
    expect(catalogService.resolveSubCategory).toHaveBeenCalledWith(42, context);
    expect(supplierRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      vatPercent: 66.67,
      taxPercent: 45,
      supplierID: '5151540809',
    }));
  });

  it('returns account percentages instead of a rounded supplier cache value', async () => {
    supplierRepo.find.mockResolvedValue([{
      id: 7,
      supplier: 'Supplier',
      userId: 'user-1',
      businessNumber: '123456789',
      subCategoryId: 42,
      vatPercent: 67,
      taxPercent: 45,
    }]);

    const result = await service.getSupplierNamesByUserId('user-1', '123456789');

    expect(result).toEqual([expect.objectContaining({
      id: 7,
      vatPercent: 66.67,
      taxPercent: 45,
    })]);
    expect(result[0]).not.toHaveProperty('userId');
    expect(result[0]).not.toHaveProperty('businessNumber');
  });

  it('reapplies account percentages when updating an existing supplier', async () => {
    supplierRepo.findOne.mockResolvedValue({
      id: 7,
      supplier: 'Supplier',
      userId: 'user-1',
      businessNumber: '123456789',
      subCategoryId: 42,
      vatPercent: 67,
      taxPercent: 45,
    });

    await service.updateSupplier(7, 'user-1', { vatPercent: 99 } as any);

    expect(supplierRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 7,
      vatPercent: 66.67,
      taxPercent: 45,
    }));
  });
});
