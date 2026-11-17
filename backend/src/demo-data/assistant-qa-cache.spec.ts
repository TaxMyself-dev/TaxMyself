import {
  assistantQaCacheOverlay,
  synchronizeAssistantQaCache,
} from './assistant-qa-cache';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { QA_MAIN } from './profiles/assistant-qa.profile';

describe('assistant QA classification cache', () => {
  const slim: any = {
    externalTransactionId: 'tx',
    businessNumber: QA_MAIN,
    billId: 212,
    category: 'עסק',
    subCategory: 'הוצאות משרד',
    subCategoryId: 39,
    confirmed: true,
    isLocked: true,
    classificationType: 'ONE_TIME',
    vatPercent: 100,
    taxPercent: 100,
    reductionPercent: 0,
    isRecognized: true,
    isEquipment: false,
    reportScope: 'PNL',
    vatReportingDate: '9/2026',
    annualReportingYear: 2026,
  };
  function fixture(row = slim) {
    const caches: any[] = [
      {
        id: 1,
        externalTransactionId: 'tx',
        businessNumber: QA_MAIN,
        billId: 212,
        confirmed: false,
        category: null,
      },
      {
        id: 2,
        externalTransactionId: 'unclassified',
        businessNumber: QA_MAIN,
        billId: 212,
      },
    ];
    const manager: any = {
      find: jest.fn(async (entity) =>
        entity === FullTransactionCache ? caches : [row],
      ),
      update: jest.fn(async (_entity, where, overlay) =>
        Object.assign(
          caches.find((c) => c.id === where.id),
          overlay,
        ),
      ),
    };
    return { caches, manager };
  }
  it('repairs the reported confirmed/slim vs unclassified/cache split and preserves source data', async () => {
    const f = fixture();
    await expect(synchronizeAssistantQaCache(f.manager, 'owner')).resolves.toBe(
      1,
    );
    expect(f.caches[0]).toMatchObject(assistantQaCacheOverlay(slim));
    expect(f.manager.update).toHaveBeenCalledWith(
      FullTransactionCache,
      { id: 1, userId: 'owner' },
      expect.not.objectContaining({ amount: expect.anything() }),
    );
    expect(f.caches[1]).not.toHaveProperty('category');
    expect(f.manager.find).toHaveBeenCalledWith(
      FullTransactionCache,
      expect.objectContaining({ where: { userId: 'owner' } }),
    );
    const first = JSON.stringify(f.caches);
    await synchronizeAssistantQaCache(f.manager, 'owner');
    expect(JSON.stringify(f.caches)).toBe(first);
  });
  it.each([{ businessNumber: 'foreign' }, { billId: 999 }])(
    'refuses mismatched business/account before updating',
    async (patch) => {
      const f = fixture({ ...slim, ...patch });
      await expect(
        synchronizeAssistantQaCache(f.manager, 'owner'),
      ).rejects.toThrow('ownership or account mismatch');
      expect(f.manager.update).not.toHaveBeenCalled();
    },
  );
  it('copies unconfirmed classification without promoting it to an expense', async () => {
    const f = fixture({ ...slim, confirmed: false, isLocked: false });
    await synchronizeAssistantQaCache(f.manager, 'owner');
    expect(f.caches[0]).toMatchObject({
      confirmed: false,
      isLocked: false,
      subCategoryId: 39,
    });
  });
});
