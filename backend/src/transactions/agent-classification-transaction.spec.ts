import { TransactionProcessingService } from './transaction-processing.service';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { SlimTransaction } from './slim-transaction.entity';
import { User } from 'src/users/user.entity';

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
            : entity === SlimTransaction
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
        ]);
        expect(
          f.calls.every((c) => c.options.lock.mode === 'pessimistic_write'),
        ).toBe(true);
        return { result: 'done', dto };
      },
    );
    expect(result).toBe('done');
    expect(f.transaction).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('owner', dto, true);
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
