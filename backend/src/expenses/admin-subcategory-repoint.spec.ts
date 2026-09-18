import { ExpensesService } from './expenses.service';
import { ApprovalStatus } from 'src/enum';

describe('ExpensesService.updateDefaultSubCategory', () => {
  const oldAccount = { id: 1, code: '60000', name: 'הוצאות לא מוכרות' };
  const newAccount = { id: 2, code: '60010', name: 'ספקים — כללי (הוצאה מוכרת)' };

  function setup() {
    const subCategory = {
      id: 46,
      name: 'ספקים',
      accountId: oldAccount.id,
      account: oldAccount,
      category: { name: 'עסק' },
      approvalStatus: ApprovalStatus.APPROVED,
    };
    const catalogService = {
      findSubCategoryInScope: jest.fn().mockResolvedValue(subCategory),
      getAccountById: jest.fn().mockResolvedValue(newAccount),
      saveSubCategory: jest.fn().mockImplementation(async (sub) => sub),
    };
    const service = Object.create(ExpensesService.prototype) as ExpensesService;
    (service as any).catalogService = catalogService;
    return { service, subCategory, catalogService };
  }

  it('replaces both the foreign key and loaded relation when changing cards', async () => {
    const { service, subCategory, catalogService } = setup();

    const result = await service.updateDefaultSubCategory(46, { accountId: newAccount.id });

    expect(subCategory.accountId).toBe(newAccount.id);
    expect(subCategory.account).toBe(newAccount);
    expect(catalogService.saveSubCategory).toHaveBeenCalledWith(subCategory);
    expect(result.accountCode).toBe('60010');
  });

  it('clears both the foreign key and loaded relation when removing a card', async () => {
    const { service, subCategory } = setup();

    const result = await service.updateDefaultSubCategory(46, { accountId: null });

    expect(subCategory.accountId).toBeNull();
    expect(subCategory.account).toBeNull();
    expect(subCategory.approvalStatus).toBe(ApprovalStatus.MISSING_ACCOUNTING_MAPPING);
    expect(result.accountCode).toBeNull();
  });
});
