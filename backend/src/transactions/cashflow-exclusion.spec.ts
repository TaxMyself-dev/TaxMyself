import { cashflowExcludedSql } from './cashflow-exclusion';
import { TransactionProcessingService } from './transaction-processing.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { ReportReviewService } from '../reports/report-review.service';
import { CatalogService } from '../bookkeeping/catalog.service';
import { UsersService } from '../users/users.service';

// Execute the actual production predicate against a local in-memory relational
// fixture. No application boot, environment credentials or external DB access.
const { DatabaseSync } = require('node:sqlite');

describe('Direct-card cashflow exclusion', () => {
  let db: any;
  const visible = () => db.prepare(`SELECT c.externalTransactionId AS id FROM full_transactions_cache c WHERE NOT (${cashflowExcludedSql('c')}) ORDER BY id`).all().map((r: any) => r.id);
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE user (firebaseId TEXT PRIMARY KEY, excludeDirectCardBankTransactionsFromCashflow INT);
      CREATE TABLE source (id INT, userId TEXT, sourceType TEXT);
      CREATE TABLE sub_category (id INT, ownerType TEXT, systemKey TEXT, name TEXT);
      CREATE TABLE slim_transactions (id INT, userId TEXT, externalTransactionId TEXT, sub_category_id INT, sourceRecordId INT);
      CREATE TABLE full_transactions_cache (userId TEXT, externalTransactionId TEXT, sub_category_id INT, sourceRecordId INT, amount REAL);
      INSERT INTO user VALUES ('owner',0),('other',1);
      INSERT INTO source VALUES (1,'owner','BANK_ACCOUNT'),(2,'owner','CREDIT_CARD'),(3,'other','BANK_ACCOUNT');
      INSERT INTO sub_category VALUES (10,'SYSTEM','DIRECT_CARD_BANK_PAYMENT','כרטיס דיירקט'),(11,'CLIENT',NULL,'כרטיס דיירקט'),(12,'SYSTEM',NULL,'מזון');
      INSERT INTO full_transactions_cache VALUES
        ('owner','bank-group',10,1,-350),('owner','card',10,2,-100),
        ('owner','ordinary',12,1,-50),('owner','custom-label',11,1,-200),
        ('owner','missing-source',10,NULL,-5),('owner','foreign-source',10,3,-6),
        ('other','other-bank',10,3,-90);
    `);
  });
  afterEach(() => db.close());

  it('defaults visible and applies each tenant preference independently', () => {
    expect(visible()).toContain('bank-group');
    expect(visible()).not.toContain('other-bank');
    db.exec("UPDATE user SET excludeDirectCardBankTransactionsFromCashflow=1 WHERE firebaseId='owner'");
    expect(visible()).toEqual(['card','custom-label','foreign-source','missing-source','ordinary']);
    db.exec("UPDATE user SET excludeDirectCardBankTransactionsFromCashflow=0 WHERE firebaseId='owner'");
    expect(visible()).toContain('bank-group');
  });

  it('excludes a grouped bank payment without matching individual card amounts; includes credits', () => {
    db.exec("UPDATE user SET excludeDirectCardBankTransactionsFromCashflow=1; INSERT INTO full_transactions_cache VALUES ('owner','refund',10,1,25)");
    expect(visible()).not.toContain('bank-group');
    expect(visible()).not.toContain('refund');
    expect(visible()).toContain('card');
  });

  it('uses durable classification rather than a stale cache and recomputes on reclassification', () => {
    db.exec("UPDATE user SET excludeDirectCardBankTransactionsFromCashflow=1; INSERT INTO slim_transactions VALUES (1,'owner','bank-group',12,1)");
    expect(visible()).toContain('bank-group');
    db.exec('UPDATE slim_transactions SET sub_category_id=10');
    expect(visible()).not.toContain('bank-group');
    db.exec('UPDATE slim_transactions SET sub_category_id=NULL');
    expect(visible()).toContain('bank-group');
  });

  it('keeps durable archive exclusion after clearing the temporary cache', () => {
    db.exec("UPDATE user SET excludeDirectCardBankTransactionsFromCashflow=1; INSERT INTO slim_transactions VALUES (1,'owner','bank-group',10,1); DELETE FROM full_transactions_cache");
    const rows = db.prepare(`SELECT slim.id FROM slim_transactions slim WHERE NOT (${cashflowExcludedSql('slim')})`).all();
    expect(rows).toHaveLength(0);
    db.exec('UPDATE user SET excludeDirectCardBankTransactionsFromCashflow=0');
    expect(db.prepare(`SELECT slim.id FROM slim_transactions slim WHERE NOT (${cashflowExcludedSql('slim')})`).all()).toHaveLength(1);
  });

  it('preserves cache identity and matches the same rule across sources of one bill', () => {
    const service: any = Object.create(TransactionProcessingService.prototype);
    const tx: any = { billId: 5, sourceRecordId: 1, merchantName: 'כרטיס', amount: -350, transactionDate: new Date('2026-10-01') };
    const rule: any = { billId: 5, transactionName: 'כרטיס', subCategoryId: 10 };
    expect(service.buildCacheRowWithRule('owner', tx, rule).subCategoryId).toBe(10);
    expect(service.buildCacheRowWithSlim('owner', tx, { subCategoryId: 10 }).subCategoryId).toBe(10);
    expect(service.slimArchiveSnapshot({ ...tx }).sourceRecordId).toBe(1);
    expect(service.matchRule({ ...tx, sourceRecordId: 2 }, [rule])).toBe(rule);
    expect(service.matchRule(tx, [rule])).toBe(rule);
    expect(service.matchRule({ ...tx, billId: 6 }, [rule])).toBeNull();
    expect(service.matchRule({ ...tx, merchantName: 'אחר' }, [rule])).toBeNull();
    expect(service.matchRule(tx, [{ ...rule, minAbsSum: 400 }])).toBeNull();
  });
});

describe('Unchanged classification rule scope', () => {
  it('looks up an existing rule using bill, merchant and conditions, without source identity', async () => {
    const service: any = Object.create(TransactionProcessingService.prototype);
    const findRule = jest.fn().mockResolvedValue({ id: 9 });
    Object.assign(service, {
      cacheRepo: { findOne: async () => ({ billId: 5, sourceRecordId: 2, merchantName: 'כרטיס' }) },
      slimRepo: { findOne: async () => null }, rulesRepo: { findOne: findRule },
    });
    await expect(service.classifyWithRule('owner', { externalTransactionId: 'tx' })).resolves.toMatchObject({ status: 'confirm_rule_override' });
    const scope = findRule.mock.calls[0][0].where;
    expect(scope).toMatchObject({ userId: 'owner', billId: 5, transactionName: 'כרטיס', minAbsSum: null, commentPattern: null });
    expect(scope).not.toHaveProperty('sourceRecordId');
  });

  it('backfills by bill and merchant without restricting candidates to the focus source', async () => {
    const service: any = Object.create(TransactionProcessingService.prototype);
    const qb: any = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) };
    Object.assign(service, { cacheRepo: { createQueryBuilder: () => qb }, getEffectiveBackfillStartDate: () => new Date('2026-01-01') });
    await expect(service.applyRuleToExistingTransactions('owner', { billId: 5, sourceRecordId: 2, merchantName: 'כרטיס' }, { id: 9 }, { externalTransactionId: 'tx' })).resolves.toBe(0);
    expect(qb.andWhere).toHaveBeenCalledWith('c.billId = :billId', { billId: 5 });
    expect(qb.andWhere).toHaveBeenCalledWith('c.merchantName = :merchantName', { merchantName: 'כרטיס' });
    expect(qb.andWhere.mock.calls.some(([clause]) => String(clause).includes('sourceRecordId'))).toBe(false);
  });
});

describe('Cashflow preference ownership and validation', () => {
  const request = (role?: string) => ({ user: { firebaseId: 'owner', role } } as any);
  const make = () => {
    const users = { setDirectCardCashflowPreference: jest.fn(), findFireUser: jest.fn().mockResolvedValue({ excludeDirectCardBankTransactionsFromCashflow: true }) };
    const controller = new TransactionsController(null, null, null, null, users as any, null, null, null);
    return { controller, users };
  };
  it('stores only a boolean on the effective owner and returns the stored value', async () => {
    const { controller, users } = make();
    await expect(controller.setCashflowPreferences(request(), { excludeDirectCardBankTransactionsFromCashflow: true })).resolves.toEqual({ excludeDirectCardBankTransactionsFromCashflow: true });
    expect(users.setDirectCardCashflowPreference).toHaveBeenCalledWith('owner', true);
  });
  it('rejects represented writes and string booleans before persistence', async () => {
    const { controller, users } = make();
    await expect(controller.setCashflowPreferences(request('agent'), { excludeDirectCardBankTransactionsFromCashflow: true })).rejects.toThrow();
    await expect(controller.setCashflowPreferences(request(), { excludeDirectCardBankTransactionsFromCashflow: 'false' } as any)).rejects.toThrow();
    expect(users.setDirectCardCashflowPreference).not.toHaveBeenCalled();
  });
  it('updates only the preference column without saving a stale user profile', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const save = jest.fn();
    const service: any = Object.create(UsersService.prototype);
    service.user_repo = { update, save };
    await service.setDirectCardCashflowPreference('owner', true);
    expect(update).toHaveBeenCalledWith({ firebaseId: 'owner' }, { excludeDirectCardBankTransactionsFromCashflow: true });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Exclusion at service boundaries', () => {
  const query = (count: number) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(count),
    };
    return qb;
  };
  it('rejects direct cache-ID approval before any expense/slim writes', async () => {
    const qb = query(1);
    const service: any = Object.create(TransactionsService.prototype);
    const save = jest.fn();
    Object.assign(service, {
      cacheRepo: { findBy: jest.fn().mockResolvedValue([{ id: 3 }]), createQueryBuilder: () => qb },
      expenseRepo: { save }, slimRepo: { save },
    });
    await expect(service.saveTransactionsToExpenses([{ id: 3 }], 'owner')).rejects.toThrow('הוחרגו');
    expect(qb.where).toHaveBeenCalledWith('c.userId = :userId', { userId: 'owner' });
    expect(qb.andWhere).toHaveBeenCalledWith(cashflowExcludedSql('c'));
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects focused archive approval even without a cache row', async () => {
    const service: any = Object.create(ReportReviewService.prototype);
    const qb = query(1);
    const readCache = jest.fn();
    Object.assign(service, {
      slimRepo: { findOne: async () => ({ id: 3, userId: 'owner', businessNumber: '123' }), createQueryBuilder: () => qb },
      cacheRepo: { findOne: readCache },
    });
    await expect(service.loadTxPair('owner', '123', 3, true)).rejects.toThrow('מוחרגת');
    expect(readCache).not.toHaveBeenCalled();
  });
  it('keeps the system label selectable under an overridden parent and blocks mutations', async () => {
    const special = { id: 10, chartOwnerKey: 'SYSTEM', name: 'כרטיס דיירקט', systemKey: 'DIRECT_CARD_BANK_PAYMENT', category: { name: 'בנק, אשראי ותנועות' } };
    const service: any = Object.create(CatalogService.prototype);
    const save = jest.fn();
    Object.assign(service, {
      subCategoryRepo: { find: async () => [], findOne: async () => special, save },
      categoryRepo: { findOne: async () => ({ id: 99, name: 'בנק, אשראי ותנועות' }) },
    });
    await expect(service.getMergedSubCategories({ userId: 'owner', businessNumber: '123' }, 99)).resolves.toEqual([special]);
    await expect(service.deleteSubCategory(special)).rejects.toThrow();
    await expect(service.saveSubCategory(special)).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
});
