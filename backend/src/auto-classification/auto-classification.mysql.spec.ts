import { DataSource, Table } from 'typeorm';
import { join } from 'path';
import { readFileSync } from 'fs';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { Source } from '../transactions/source.entity';
import { Bill } from '../transactions/bill.entity';
import { Expense } from '../expenses/expenses.entity';
import { UserSourceSyncState } from '../transactions/user-source-sync-state.entity';
import { UserTransactionCacheState } from '../transactions/user-transaction-cache-state.entity';
import { TransactionProcessingService } from '../transactions/transaction-processing.service';
import { AgentClassificationService } from '../agent-harness/agent-classification.service';
import {
  AutoClassificationService,
  autoIdentity,
} from './auto-classification.service';
import { FIELDS } from '../agent-onboarding/onboarding.domain';
import { randomUUID } from 'crypto';

const url = process.env.AUTO_CLASSIFICATION_TEST_MYSQL_URL;
if (url) {
  const u = new URL(url);
  if (
    !['127.0.0.1', 'localhost'].includes(u.hostname) ||
    u.pathname !== '/auto_classification_test'
  )
    throw new Error(
      'Only disposable local auto_classification_test is permitted',
    );
}
const suite = url ? describe : describe.skip;
suite('automatic classifier on disposable real MySQL', () => {
  let db: DataSource,
    processing: TransactionProcessingService,
    service: AutoClassificationService,
    model: any;
  const owner = 'auto-qa-owner',
    business = 'qa-business';
  let billId: number, sourceId: number;
  const category: any = {
    id: 5,
    name: 'תוכנה',
    category: { name: 'משרד' },
    isPrivate: false,
    approvalStatus: 'APPROVED',
    account: {
      vatPercent: 0,
      taxPercent: 0,
      isEquipment: false,
      reductionPercent: 0,
      recognitionType: 'RECOGNIZED',
    },
  };
  const law = {
    subCategoryId: 5,
    category: 'משרד',
    subCategory: 'תוכנה',
    vatPercent: 0,
    taxPercent: 0,
    isEquipment: false,
    reductionPercent: 0,
    isRecognized: true,
    reportScope: 'pnl',
  };
  async function seed(entity: any, values: any) {
    const m = db.getMetadata(entity);
    const row: any = {};
    for (const c of m.columns) {
      if (
        c.isGenerated ||
        c.isNullable ||
        c.default !== undefined ||
        c.isCreateDate ||
        c.isUpdateDate ||
        values[c.propertyName] !== undefined
      )
        continue;
      row[c.propertyName] =
        c.enum?.[0] ??
        (c.type === Boolean
          ? false
          : c.type === Number ||
            ['int', 'bigint', 'decimal', 'float', 'double', 'tinyint'].includes(
              String(c.type),
            )
          ? 0
          : ['datetime', 'timestamp', 'date'].includes(String(c.type))
          ? new Date('2026-11-19')
          : c.type === 'json'
          ? '{}'
          : 'qa');
    }
    const inserted = await db
      .getRepository(entity)
      .insert({ ...row, ...values });
    return inserted.identifiers[0];
  }
  async function transaction(id: string, extra: any = {}) {
    return seed(FullTransactionCache, {
      userId: owner,
      externalTransactionId: id,
      billId,
      sourceRecordId: sourceId,
      billName: 'חשבון בדיקה',
      businessNumber: business,
      merchantName: 'מנוי תוכנה מפורש',
      amount: -50,
      transactionDate: new Date('2026-11-01'),
      category: null,
      subCategory: null,
      confirmed: false,
      isLocked: false,
      ...extra,
    });
  }
  async function profile() {
    for (const scope of ['', business]) {
      const fields = Object.fromEntries(FIELDS.map((f) => [f.key, 'known']));
      const cols = FIELDS.filter(
        (f) => f.scope === (scope ? 'business' : 'person'),
      ).map((f) => f.key);
      await db.query(
        `INSERT INTO agent_onboarding_profiles(id,owner_uid,scope_key,field_states,story,${cols.join(
          ',',
        )}) VALUES (?,?,?,?,?,${cols.map(() => '?').join(',')})`,
        [
          randomUUID(),
          owner,
          scope,
          JSON.stringify(fields),
          'העסק משתמש במנוי תוכנה לעבודה בלבד',
          ...cols.map(() => 'מידע מפורש'),
        ],
      );
    }
  }
  beforeAll(async () => {
    process.env.AGENT_AUTO_CLASSIFICATION_ENABLED = 'true';
    process.env.AGENT_ONBOARDING_ENABLED = 'true';
    db = new DataSource({
      type: 'mysql',
      url,
      entities: [join(__dirname, '../**/*.entity.ts')],
      synchronize: false,
      timezone: 'Z',
      logging: false,
    });
    await db.initialize();
    if (
      (await db.query('SELECT DATABASE() AS db'))[0].db !==
      'auto_classification_test'
    )
      throw new Error('Wrong database');
    const runner = db.createQueryRunner();
    // Only the disposable local database is allowed; no application bootstrap or boot seed.
    for (const entity of [
      User,
      Business,
      Bill,
      Source,
      UserSourceSyncState,
      FullTransactionCache,
      SlimTransaction,
      ClassifiedTransactions,
      Expense,
      UserTransactionCacheState,
    ])
      await runner.createTable(
        Table.create(db.getMetadata(entity), db.driver),
        true,
        false,
        true,
      );
    await runner.release();
    for (const name of [
      '2026-11-19_agent_onboarding.sql',
      '2026-11-19_auto_classification.sql',
    ]) {
      const sql = readFileSync(
        join(__dirname, '../../scripts/migrations', name),
        'utf8',
      ).replace(/^\s*--.*$/gm, '');
      // Entities above already include new nullable provenance columns. Test CREATEs here; ALTER coverage below.
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        if (statement.startsWith('CREATE TABLE')) await db.query(statement);
    }
    const shared: any = {
      buildReportPeriodLabel: () => '2026',
      nextOpenPeriodLabels: () => [],
    };
    const expenses: any = {
      resolveTransactionSubCategory: async () => ({}),
      effectiveTransactionClassification: async () => law,
    };
    processing = new TransactionProcessingService(
      db.getRepository(SlimTransaction),
      db.getRepository(FullTransactionCache),
      db.getRepository(UserTransactionCacheState),
      db.getRepository(ClassifiedTransactions),
      db.getRepository(Source),
      db.getRepository(Bill),
      db.getRepository(Business),
      db.getRepository(Expense),
      {} as any,
      shared,
      {} as any,
      db,
      expenses,
    );
    const domain: any = {
      assertAccessStillHolds: async () => undefined,
      ownerBusinesses: async () => [{ businessNumber: business }],
      resolveBusiness: async (user: any, bn: string) => {
        if (user.firebaseId !== owner || bn !== business)
          throw new Error('scope');
        return {
          business: { businessNumber: business, businessName: 'עסק בדיקה' },
        };
      },
    };
    const catalog: any = { getMergedExpenseCatalog: async () => [category] },
      context: any = { forUser: async () => ({}) },
      billing: any = { hasModuleAccess: async () => true };
    const classification = new AgentClassificationService(
      domain,
      processing,
      catalog,
      context,
      db,
      billing,
      { isRepresentedByAccountant: async () => false } as any,
    );
    model = {
      decide: jest.fn(async () => ({
        kind: 'rule',
        subCategoryId: 5,
        reason: 'מנוי תוכנה עסקי שנמסר במפורש',
        question: null,
      })),
    };
    service = new AutoClassificationService(
      db,
      domain,
      classification,
      processing,
      catalog,
      context,
      billing,
      model,
    );
  }, 60000);
  beforeEach(async () => {
    for (const table of [
      'agent_auto_items',
      'agent_auto_preferences',
      'agent_onboarding_profiles',
      'slim_transactions',
      'classified_transactions',
      'full_transactions_cache',
      'expense',
      'user_source_sync_state',
      'source',
      'bill',
      'business',
      'user',
    ])
      await db.query('DELETE FROM `' + table + '`');
    await seed(User, { firebaseId: owner, hasOpenBanking: true });
    await seed(Business, {
      firebaseId: owner,
      businessNumber: business,
      businessName: 'עסק בדיקה',
    });
    billId = (
      await seed(Bill, {
        userId: owner,
        businessNumber: business,
        billName: 'חשבון בדיקה',
      })
    ).id;
    sourceId = (
      await seed(Source, {
        userId: owner,
        sourceName: 'כרטיס בדיקה',
        sourceType: 'CREDIT_CARD',
        connectionRole: 'primary',
        bill: { id: billId },
      })
    ).id;
    await seed(UserSourceSyncState, {
      userId: owner,
      sourceRecordId: sourceId,
      sourceId: '1234',
      type: 'card',
      consentId: 'verified-consent',
    });
    await profile();
    await service.consent(autoIdentity(owner), true);
    model.decide.mockClear();
    model.decide.mockImplementation(async () => ({
      kind: 'rule',
      subCategoryId: 5,
      reason: 'מנוי תוכנה עסקי שנמסר במפורש',
      question: null,
    }));
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  it('creates one durable SYSTEM rule, classifies once and never approves expenses', async () => {
    const row = await transaction('first');
    await service.process(owner, row.id, 1);
    await service.process(owner, row.id, 1);
    expect(await db.getRepository(ClassifiedTransactions).count()).toBe(1);
    expect(
      await db
        .getRepository(SlimTransaction)
        .findOneBy({ userId: owner, externalTransactionId: 'first' }),
    ).toMatchObject({
      classificationSource: 'SYSTEM',
      confirmed: false,
      classificationType: 'RULE',
    });
    expect(
      (await db.getRepository(ClassifiedTransactions).find())[0],
    ).toMatchObject({ createdBySource: 'SYSTEM', updatedBySource: 'SYSTEM' });
    expect(await db.getRepository(Expense).count()).toBe(0);
    expect(
      (await db.query('SELECT state FROM agent_auto_items'))[0].state,
    ).toBe('classified');
  });
  it('applies the created rule to older history in bounded separate transactions', async () => {
    const first = await transaction('new');
    const old = await transaction('old', {
      transactionDate: new Date('2020-01-01'),
    });
    await service.process(owner, first.id, 1);
    expect(await db.getRepository(SlimTransaction).count()).toBe(1);
    await service.process(owner, old.id, 1);
    expect(await db.getRepository(SlimTransaction).count()).toBe(2);
    expect(await db.getRepository(ClassifiedTransactions).count()).toBe(1);
    expect(model.decide).toHaveBeenCalledTimes(1);
  });
  it('serializes racing workers without duplicate rules or notifications', async () => {
    const row = await transaction('race');
    await Promise.all([
      service.process(owner, row.id, 1),
      service.process(owner, row.id, 1),
    ]);
    expect(await db.getRepository(ClassifiedTransactions).count()).toBe(1);
    expect(await db.getRepository(SlimTransaction).count()).toBe(1);
    expect(
      Number(
        (await db.query('SELECT COUNT(*) AS n FROM agent_auto_items'))[0].n,
      ),
    ).toBe(1);
  });
  it('rolls item/rule/cache/slim back together on an actual database error', async () => {
    const row = await transaction('rollback');
    const original = processing.classifyPendingForAgent.bind(processing);
    const spy = jest
      .spyOn(processing, 'classifyPendingForAgent')
      .mockImplementation((o, t, pre, single, automatic) =>
        original(
          o,
          t,
          async (c, s, m) => {
            const result = await pre(c, s, m);
            await m.query(
              "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rollback'",
            );
            return result;
          },
          single,
          automatic,
        ),
      );
    await service.process(owner, row.id, 1);
    spy.mockRestore();
    expect(await db.getRepository(ClassifiedTransactions).count()).toBe(0);
    expect(await db.getRepository(SlimTransaction).count()).toBe(0);
    expect(
      (await db.getRepository(FullTransactionCache).findOneBy({ id: row.id }))
        .category,
    ).toBeNull();
    expect(
      (await db.query('SELECT state FROM agent_auto_items'))[0].state,
    ).toBe('retry');
  });
  it('revocation during real model work prevents a write', async () => {
    const row = await transaction('revoke');
    model.decide.mockImplementation(async () => {
      await service.consent(autoIdentity(owner), false);
      return { kind: 'rule', subCategoryId: 5, reason: 'r', question: null };
    });
    await service.process(owner, row.id, 1);
    expect(await db.getRepository(ClassifiedTransactions).count()).toBe(0);
    expect(await db.getRepository(SlimTransaction).count()).toBe(0);
  });
  it('does not overwrite an existing one-time decision', async () => {
    const row = await transaction('manual');
    await processing.classifyManually(
      owner,
      { externalTransactionId: 'manual', ...law } as any,
      true,
    );
    await service.process(owner, row.id, 1);
    expect(
      (
        await db
          .getRepository(SlimTransaction)
          .findOneBy({ externalTransactionId: 'manual' })
      ).classificationType,
    ).toBe('ONE_TIME');
    expect(await db.getRepository(ClassifiedTransactions).count()).toBe(0);
  });
  it('preserves a question as read but unresolved and isolates inbox owners', async () => {
    const row = await transaction('question');
    model.decide.mockResolvedValue({
      kind: 'clarify',
      subCategoryId: null,
      reason: 'ספק',
      question: 'מה נרכש?',
    });
    await service.process(owner, row.id, 1);
    const inbox = await service.inbox(autoIdentity(owner));
    expect(inbox.unread).toBe(1);
    await service.read(autoIdentity(owner), inbox.items[0].id);
    expect((await service.inbox(autoIdentity(owner))).unread).toBe(0);
    expect((await service.inbox(autoIdentity(owner))).items[0].state).toBe(
      'waiting',
    );
    expect((await service.inbox(autoIdentity('other'))).items).toEqual([]);
    await expect(
      service.notice(autoIdentity('other'), inbox.items[0].id),
    ).rejects.toThrow();
  });
  it('revisits more than a page and preserves the durable scan cursor', async () => {
    for (let i = 0; i < 12; i++) await transaction('page-' + i);
    await service.tick();
    const [pref] = await db.query(
      'SELECT scan_cursor FROM agent_auto_preferences WHERE owner_uid=?',
      [owner],
    );
    expect(Number(pref.scan_cursor)).toBeGreaterThan(0);
    await db.query(
      'UPDATE agent_auto_preferences SET next_scan_at=NOW(3) WHERE owner_uid=?',
      [owner],
    );
    await service.tick();
    expect(await db.getRepository(SlimTransaction).count()).toBe(12);
  });
  it('implements the global lock on a real dedicated MySQL connection', async () => {
    const r = db.createQueryRunner();
    await r.connect();
    await r.query('SELECT GET_LOCK(?,0)', ['keepintax:auto-classification:v1']);
    await transaction('locked');
    await service.tick();
    expect(model.decide).not.toHaveBeenCalled();
    await r.query('SELECT RELEASE_LOCK(?)', [
      'keepintax:auto-classification:v1',
    ]);
    await r.release();
  });
  it('does not lose identical-timestamp notifications across pages', async () => {
    for (let i = 0; i < 55; i++)
      await db.query(
        "INSERT INTO agent_auto_items(id,owner_uid,external_id,business_number,state,display_json,updated_at) VALUES (?,?,?,?,'waiting',JSON_OBJECT(),'2026-11-19 12:00:00.000')",
        [randomUUID(), owner, 'n-' + i, business],
      );
    const first = await service.inbox(autoIdentity(owner));
    expect(first.items).toHaveLength(50);
    const second = await service.inbox(autoIdentity(owner), first.nextCursor);
    expect(second.items).toHaveLength(5);
    expect(
      new Set([...first.items, ...second.items].map((r) => r.id)).size,
    ).toBe(55);
  });
  it('closes a question after manual classification and removes its unread badge', async () => {
    const row = await transaction('resolved');
    model.decide.mockResolvedValue({
      kind: 'clarify',
      subCategoryId: null,
      reason: 'ספק',
      question: 'מה נרכש?',
    });
    await service.process(owner, row.id, 1);
    await processing.classifyManually(
      owner,
      { externalTransactionId: 'resolved', ...law } as any,
      true,
    );
    await service.tick();
    const inbox = await service.inbox(autoIdentity(owner));
    expect(inbox.unread).toBe(0);
    expect(inbox.items[0]).toMatchObject({ state: 'resolved', question: null });
  });
});
