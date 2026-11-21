import { Bill } from '../transactions/bill.entity';
import { DataSource, SelectQueryBuilder, UpdateQueryBuilder } from 'typeorm';
import { reconcilePendingClassifications, transactionClassification } from './pending-classification';
import { Business } from '../business/business.entity';
import { Delegation } from '../delegation/delegation.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { Expense } from '../expenses/expenses.entity';
import { ExpenseReportScope, RecognitionType } from '../enum';

describe('effective pending classification reconciliation', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'mysql', database: 'metadata_only', entities: [__dirname + '/../**/*.entity.ts'] });
    await (ds as any).buildMetadatas();
  });
  afterEach(() => jest.restoreAllMocks());
  const resolved: any = {
    subCategory: { id: 91, name: 'fuel', category: { name: 'vehicle' }, isPrivate: false },
    vatPercent: 100, taxPercent: 45, reductionPercent: 0, isEquipment: false,
    recognitionType: RecognitionType.RECOGNIZED, reportScope: ExpenseReportScope.PNL,
  };
  it('derives the complete transaction payload from personal law, including private/missing mapping', () => {
    expect(transactionClassification(resolved)).toMatchObject({ subCategoryId: 91, vatPercent: 100, isRecognized: true });
    expect(transactionClassification({ ...resolved, subCategory: { ...resolved.subCategory, isPrivate: true }, recognitionType: null, vatPercent: null }))
      .toMatchObject({ vatPercent: 0, isRecognized: false });
  });
  it('generates MySQL updates that protect approved/locked rows in both tables and maps the FK correctly', async () => {
    const pair = { category: 'vehicle', subCategory: 'fuel' };
    const rule: any = { id: 7, userId: 'owner', ...pair, subCategoryId: 1, vatPercent: 66 };
    const sql: string[] = [];
    const businesses = [{ firebaseId: 'owner', businessNumber: 'biz' }];
    const manager: any = {
      connection: ds,
      getRepository: (entity: any) => {
        const repo = ds.getRepository(entity);
        if (entity === Business) return { find: jest.fn().mockResolvedValue(businesses) };
        if (entity === Bill) return { find: jest.fn().mockResolvedValue([{ id: 2 }]) };
        if (entity === Delegation) return { find: jest.fn().mockResolvedValue([{ agentId: 'accountant' }]) };
        if (entity === SlimTransaction || entity === FullTransactionCache)
          return Object.assign(Object.create(repo), { find: jest.fn().mockResolvedValue([pair]) });
        return repo;
      },
    };
    jest.spyOn(SelectQueryBuilder.prototype, 'getMany').mockResolvedValue([rule]);
    jest.spyOn(UpdateQueryBuilder.prototype, 'execute').mockImplementation(async function() {
      sql.push(this.getQuery()); return { affected: 1, generatedMaps: [], raw: [] };
    });
    const catalog: any = { resolveByName: jest.fn().mockResolvedValue(resolved) };
    await reconcilePendingClassifications(manager, catalog, { userId: 'owner', subCategoryName: 'fuel' });
    expect(catalog.resolveByName).toHaveBeenCalledWith('vehicle', 'fuel', expect.objectContaining({ userId: 'owner', businessNumber: 'biz', accountantIds: ['accountant'] }));
    const pendingSql = sql.filter(q => q.startsWith('UPDATE \u0060slim_transactions') || q.startsWith('UPDATE \u0060full_transactions_cache'));
    expect(pendingSql).toHaveLength(2);
    for (const q of pendingSql) {
      expect(q.replace(/`/g, '')).toContain('confirmed = false AND isLocked = false');
      expect(q).toContain('NOT EXISTS');
      expect(q).toContain('e.approvalStatus');
      expect(q).toContain('e.isReported');
      expect(q).toContain('userId');
      expect(q).toContain('businessNumber');
    }
    expect(pendingSql[0]).toContain('\u0060sub_category_id\u0060');
    expect(pendingSql[1]).toContain('s.confirmed = true OR s.isLocked = true');
    expect(sql.some(q => q.startsWith('UPDATE \u0060classified_transactions'))).toBe(true);
    expect(sql.some(q => q.startsWith('UPDATE \u0060expense'))).toBe(false);
  });
});
