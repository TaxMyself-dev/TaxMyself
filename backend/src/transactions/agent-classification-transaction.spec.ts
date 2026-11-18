import { TransactionProcessingService } from './transaction-processing.service';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { SlimTransaction } from './slim-transaction.entity';
import { User } from 'src/users/user.entity';
import { Expense } from 'src/expenses/expenses.entity';

describe('agent classification transaction boundary', () => {
  function setup() {
    const cache = { userId: 'owner', externalTransactionId: 'tx', billId: 1 };
    const calls: any[] = [];
    const manager: any = {
      getRepository: (entity: any) => ({
        findOne: jest.fn(async (options: any) => {
          calls.push({ entity, options });
          return entity === FullTransactionCache
            ? cache
            : entity === SlimTransaction || entity === Expense
            ? null
            : { firebaseId: 'owner' };
        }),
      }),
    };
    const service = Object.create(
      TransactionProcessingService.prototype,
    ) as TransactionProcessingService;
    const transaction = jest.fn(async (work: any) => work(manager));
    Object.assign(service, { dataSource: { transaction } });
    return { service, calls, transaction, cache };
  }
  afterEach(() => jest.restoreAllMocks());
  it('locks the owner, cache and slim before preflight and uses classification-only on scoped repositories', async () => {
    const f = setup();
    const write = jest
      .spyOn(TransactionProcessingService.prototype, 'classifyManually')
      .mockResolvedValue(undefined);
    const dto: any = {
      externalTransactionId: 'tx',
      category: 'משרד',
      subCategory: 'תוכנה',
    };
    const result = await f.service.classifyPendingForAgent(
      'owner',
      'tx',
      async (cache) => {
        expect(cache).toBe(f.cache);
        expect(f.calls.map((c) => c.entity)).toEqual([
          User,
          FullTransactionCache,
          SlimTransaction,
          Expense,
        ]);
        expect(
          f.calls.filter(c => c.entity !== Expense).every((c) => c.options.lock.mode === 'pessimistic_write'),
        ).toBe(true);
        return { result: 'done', dto };
      },
    );
    expect(result).toBe('done');
    expect(f.transaction).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('owner', dto, true);
  });

  it('uses the existing rule path with explicit override, classification-only and business scope', async () => {
    const f = setup();
    const single = jest
      .spyOn(TransactionProcessingService.prototype, 'classifyManually')
      .mockResolvedValue();
    const permanent = jest
      .spyOn(TransactionProcessingService.prototype, 'classifyWithRule')
      .mockResolvedValue({
        status: 'applied',
        ruleId: 7,
        backfillCount: 2,
        message: 'done',
      });
    Object.assign(f.cache, { businessNumber: 'biz' });
    const dto: any = {
      externalTransactionId: 'tx',
      category: 'משרד',
      subCategory: 'תוכנה',
    };
    const result = await f.service.classifyPendingForAgent(
      'owner',
      'tx',
      async () => ({ result: { status: 'classified' }, dto }),
      false,
    );
    expect(single).not.toHaveBeenCalled();
    expect(permanent).toHaveBeenCalledWith(
      'owner',
      { ...dto, confirmOverride: true },
      true,
      'biz',
    );
    expect(result).toMatchObject({ ruleId: 7, backfillCount: 2 });
  });
  it('blocks an approved cache row before agent preflight even if slim is missing', async () => {
    const f = setup();
    Object.assign(f.cache, { confirmed: true });
    const preflight = jest.fn();
    await expect(f.service.classifyPendingForAgent('owner', 'tx', preflight)).rejects.toThrow('agent cannot edit');
    expect(preflight).not.toHaveBeenCalled();
  });
  it.each([true, false])('blocks an approved expense for agent mode single=%s', async single => {
    const f = setup();
    (f.service as any).dataSource.transaction = async (work: any) => work({
      getRepository: (entity: any) => ({ findOne: async () => entity === FullTransactionCache ? f.cache
        : entity === Expense ? { approvalStatus: 'APPROVED' } : null }),
    });
    const preflight = jest.fn();
    await expect(f.service.classifyPendingForAgent('owner', 'tx', preflight, single)).rejects.toThrow('agent cannot edit');
    expect(preflight).not.toHaveBeenCalled();
  });
  it('a rule guard failure propagates out of the shared transaction', async () => {
    const f = setup();
    jest
      .spyOn(TransactionProcessingService.prototype, 'classifyWithRule')
      .mockResolvedValue({ status: 'blocked_vat_reported', message: 'locked' });
    await expect(
      f.service.classifyPendingForAgent(
        'owner',
        'tx',
        async () => ({
          result: {},
          dto: { externalTransactionId: 'tx' } as any,
        }),
        false,
      ),
    ).rejects.toThrow('CLASSIFICATION_BLOCKED');
  });
  it('a stale/forbidden preflight reaches no write and propagates transaction failure', async () => {
    const f = setup();
    const write = jest
      .spyOn(TransactionProcessingService.prototype, 'classifyManually')
      .mockResolvedValue(undefined);
    await expect(
      f.service.classifyPendingForAgent('owner', 'tx', async () => {
        throw new Error('CLASSIFICATION_STALE');
      }),
    ).rejects.toThrow('CLASSIFICATION_STALE');
    expect(write).not.toHaveBeenCalled();
  });
  it('an already applied proposal produces no second write', async () => {
    const f = setup();
    const write = jest
      .spyOn(TransactionProcessingService.prototype, 'classifyManually')
      .mockResolvedValue(undefined);
    expect(
      await f.service.classifyPendingForAgent('owner', 'tx', async () => ({
        result: 'already_applied',
      })),
    ).toBe('already_applied');
    expect(write).not.toHaveBeenCalled();
  });
  it('a classification failure rejects the same transaction instead of returning success', async () => {
    const f = setup();
    jest
      .spyOn(TransactionProcessingService.prototype, 'classifyManually')
      .mockRejectedValue(new Error('report locked'));
    await expect(
      f.service.classifyPendingForAgent('owner', 'tx', async () => ({
        result: 'success',
        dto: { externalTransactionId: 'tx' } as any,
      })),
    ).rejects.toThrow('report locked');
  });
});

describe('agent rule scope and identity', () => {
  it('restricts backfill to the approved business and excludes confirmed/locked cache rows', async () => {
    const service:any = Object.create(TransactionProcessingService.prototype);
    const qb:any = {where:jest.fn().mockReturnThis(),andWhere:jest.fn().mockReturnThis(),getMany:jest.fn().mockResolvedValue([])};
    Object.assign(service,{cacheRepo:{createQueryBuilder:()=>qb},getEffectiveBackfillStartDate:()=>new Date('2025-11-10')});
    await service.applyRuleToExistingTransactions('owner',{billId:2,merchantName:'merchant'},{id:5},{externalTransactionId:'tx'},true,'biz');
    expect(qb.where).toHaveBeenCalledWith('c.userId = :userId',{userId:'owner'});
    expect(qb.andWhere).toHaveBeenCalledWith('c.businessNumber = :agentBusinessNumber',{agentBusinessNumber:'biz'});
    expect(qb.andWhere).toHaveBeenCalledWith('c.confirmed = :agentConfirmed AND c.isLocked = :agentLocked',{agentConfirmed:false,agentLocked:false});
  });
  it('does not select a constrained rule when creating the default unconstrained rule', async () => {
    const service:any = Object.create(TransactionProcessingService.prototype);
    const lookup=jest.fn().mockRejectedValue(new Error('stop before writes'));
    Object.assign(service,{expensesService:{effectiveTransactionClassification:jest.fn().mockResolvedValue({})},cacheRepo:{findOne:jest.fn().mockResolvedValue({billId:2,merchantName:'merchant'})},slimRepo:{findOne:jest.fn().mockResolvedValue(null)},rulesRepo:{findOne:lookup}});
    await expect(service.classifyWithRule('owner',{externalTransactionId:'tx'})).rejects.toThrow('stop before writes');
    const where=lookup.mock.calls[0][0].where;
    for(const field of ['startDate','endDate','minAbsSum','maxAbsSum','commentPattern']) expect(where[field]._type).toBe('isNull');
  });
});
