import { TransactionProcessingService } from './transaction-processing.service';
import { ClassificationType } from './enums/classification-type.enum';

describe('effective transaction classification and approval boundary', () => {
  function fixture(confirmed: boolean, isLocked = false) {
    const service: any = Object.create(TransactionProcessingService.prototype);
    const slim = { confirmed, isLocked, businessNumber: 'biz' };
    const personal = { category: 'vehicle', subCategory: 'fuel', subCategoryId: 91,
      vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, isRecognized: true };
    Object.assign(service, {
      cacheRepo: { findOne: jest.fn().mockResolvedValue({ billId: 2, businessNumber: 'biz' }), update: jest.fn() },
      slimRepo: { findOne: jest.fn().mockResolvedValue(slim) },
      expensesService: { effectiveTransactionClassification: jest.fn().mockResolvedValue(personal) },
      resolveStampPeriod: jest.fn().mockResolvedValue('11/2026'),
      upsertSlimTransactions: jest.fn(), syncExpenseFromSlim: jest.fn(), slimArchiveSnapshot: jest.fn().mockReturnValue({}),
    });
    const dto = { externalTransactionId: 'tx', category: 'vehicle', subCategory: 'fuel', vatPercent: 66, taxPercent: 45 };
    return { service, dto, personal };
  }
  it('canonicalizes an unapproved manual pick to personal law even with stale input percentages', async () => {
    const { service, dto, personal } = fixture(false);
    await service.classifyManually('owner', dto);
    expect(service.upsertSlimTransactions).toHaveBeenCalledWith([expect.objectContaining({ ...personal, classificationType: ClassificationType.ONE_TIME })]);
    expect(service.cacheRepo.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(personal));
    expect(service.syncExpenseFromSlim).not.toHaveBeenCalled();
  });
  it('keeps authorized manual editing of approved but unsubmitted transactions available', async () => {
    const { service, dto } = fixture(true);
    await service.classifyManually('owner', dto, false);
    expect(service.expensesService.effectiveTransactionClassification).not.toHaveBeenCalled();
    expect(service.syncExpenseFromSlim).toHaveBeenCalledWith('owner', expect.anything(), expect.objectContaining({ vatPercent: 66, taxPercent: 45 }));
  });
  it('blocks agent/represented classification mode on an approved transaction', async () => {
    const { service, dto } = fixture(true);
    await expect(service.classifyManually('owner', dto, true)).rejects.toThrow();
    expect(service.upsertSlimTransactions).not.toHaveBeenCalled();
  });
  it('blocks a submitted transaction for manual users as well', async () => {
    const { service, dto } = fixture(true, true);
    await expect(service.classifyManually('owner', dto, false)).rejects.toMatchObject({ status: 423 });
    expect(service.upsertSlimTransactions).not.toHaveBeenCalled();
  });
  it('resolves future rule matches per business, with one lookup per label and business', async () => {
    const service: any = Object.create(TransactionProcessingService.prototype);
    const builder: any = {};
    for (const method of ['insert','into','values','orIgnore','updateEntity','orUpdate','select','where','andWhere'])
      builder[method] = jest.fn().mockReturnValue(builder);
    builder.execute = jest.fn().mockResolvedValue({ affected: 1 });
    builder.getCount = jest.fn().mockResolvedValue(0);
    const old = { id: 5, billId: 2, category: 'vehicle', subCategory: 'fuel', vatPercent: 66, businessNumber: null };
    Object.assign(service, {
      expensesService: { refreshPendingTransactionClassifications: jest.fn(),
        effectiveTransactionClassification: jest.fn(async (_user, bn) => ({ category: 'vehicle', subCategory: 'fuel',
          subCategoryId: bn === 'personal' ? 91 : 1, vatPercent: bn === 'personal' ? 100 : 66 })) },
      buildBillMap: jest.fn().mockResolvedValue(new Map()), loadSlimMap: jest.fn().mockResolvedValue(new Map()),
      loadSlimByCompositeKey: jest.fn().mockResolvedValue(new Map()),
      rulesRepo: { find: jest.fn().mockResolvedValue([old]) }, matchRule: jest.fn().mockReturnValue(old),
      slimRepo: { createQueryBuilder: () => builder },
      cacheRepo: { createQueryBuilder: () => builder, metadata: { findColumnWithPropertyName: k => ({ databaseName: k }) } },
      updateCacheState: jest.fn(),
    });
    const tx: any = { billId: 2, merchantName: 'station', amount: -100, currency: 'ILS', transactionDate: new Date('2026-11-18') };
    await service.process('owner', [
      { ...tx, externalTransactionId: 'a', businessNumber: 'personal' },
      { ...tx, externalTransactionId: 'b', businessNumber: 'personal' },
      { ...tx, externalTransactionId: 'c', businessNumber: 'other' },
    ]);
    const inserted = builder.values.mock.calls[0][0];
    expect(inserted.map(r => [r.subCategoryId, r.vatPercent])).toEqual([[91,100],[91,100],[1,66]]);
    expect(service.expensesService.effectiveTransactionClassification).toHaveBeenCalledTimes(2);
    expect(old.vatPercent).toBe(66);
  });

});
