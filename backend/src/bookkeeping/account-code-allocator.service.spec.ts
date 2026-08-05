/**
 * Unit tests: AccountCodeAllocatorService — getNextAccountCode (D2/1.5)
 *
 * Covers:
 *  - range floor when chartOwnerKey has no accounts yet, per ownerType/type
 *  - jumps of 10 from the highest existing in-range code
 *  - per-chartOwnerKey isolation (same ownerType/type, different keys)
 *  - manual out-of-range codes are ignored (tolerated) when computing the next code
 *  - manual in-range off-grid codes are jumped from, not collided with
 *  - unknown ownerType/type combination throws
 *  - exhausted range throws
 *  - honors a caller-supplied EntityManager instead of the injected repo
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { AccountCodeAllocatorService } from './account-code-allocator.service';
import { BookingAccount } from './account.entity';
import { OwnerType } from '../enum';

function makeRepo(codes: string[] = []): jest.Mocked<Repository<BookingAccount>> {
  return {
    find: jest.fn().mockResolvedValue(codes.map((code) => ({ code }))),
  } as any;
}

describe('AccountCodeAllocatorService — getNextAccountCode', () => {
  let service: AccountCodeAllocatorService;
  let bookingAccountRepo: jest.Mocked<Repository<BookingAccount>>;

  const build = async (codes: string[] = []) => {
    bookingAccountRepo = makeRepo(codes);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountCodeAllocatorService,
        { provide: getRepositoryToken(BookingAccount), useValue: bookingAccountRepo },
      ],
    }).compile();
    service = module.get<AccountCodeAllocatorService>(AccountCodeAllocatorService);
  };

  afterEach(() => jest.restoreAllMocks());

  // ── range floor per ownerType/type ─────────────────────────────────────────

  describe('range floor (empty chartOwnerKey)', () => {
    it.each([
      [OwnerType.SYSTEM, 'income', '40000'],
      [OwnerType.SYSTEM, 'expense', '60000'],
      [OwnerType.ACCOUNTANT, 'income', '50000'],
      [OwnerType.ACCOUNTANT, 'expense', '70000'],
      [OwnerType.CLIENT, 'income', '50000'],
      [OwnerType.CLIENT, 'expense', '80000'],
    ] as const)('%s/%s starts at %s', async (ownerType, type, expected) => {
      await build([]);
      const code = await service.getNextAccountCode({ ownerType, type, chartOwnerKey: 'SOME_KEY' });
      expect(code).toBe(expected);
    });
  });

  // ── jumps of 10 ───────────────────────────────────────────────────────────

  describe('jumps of 10', () => {
    it('allocates max + 10 when in-range codes already exist', async () => {
      await build(['70000', '70010', '70020']);
      const code = await service.getNextAccountCode({
        ownerType: OwnerType.ACCOUNTANT,
        type: 'expense',
        chartOwnerKey: 'ACCOUNTANT_agent1',
      });
      expect(code).toBe('70030');
    });

    it('queries only the given chartOwnerKey', async () => {
      await build(['70000']);
      await service.getNextAccountCode({
        ownerType: OwnerType.ACCOUNTANT,
        type: 'expense',
        chartOwnerKey: 'ACCOUNTANT_agent1',
      });
      expect(bookingAccountRepo.find).toHaveBeenCalledWith({
        where: { chartOwnerKey: 'ACCOUNTANT_agent1' },
        select: ['code'],
      });
    });
  });

  // ── per-chartOwnerKey isolation ─────────────────────────────────────────────

  describe('per-chartOwnerKey isolation', () => {
    it('two different chartOwnerKeys with the same ownerType/type allocate independently', async () => {
      // The repo mock only knows about ONE chartOwnerKey's rows at a time —
      // simulating that a fresh accountant's own key sees none of another
      // accountant's accounts, even though both are ownerType=ACCOUNTANT.
      await build(['70000', '70010']); // e.g. rows belonging to ACCOUNTANT_agent1
      const codeForAgent1 = await service.getNextAccountCode({
        ownerType: OwnerType.ACCOUNTANT,
        type: 'expense',
        chartOwnerKey: 'ACCOUNTANT_agent1',
      });
      expect(codeForAgent1).toBe('70020');

      await build([]); // ACCOUNTANT_agent2 has no rows of its own
      const codeForAgent2 = await service.getNextAccountCode({
        ownerType: OwnerType.ACCOUNTANT,
        type: 'expense',
        chartOwnerKey: 'ACCOUNTANT_agent2',
      });
      expect(codeForAgent2).toBe('70000');
    });
  });

  // ── manual codes tolerated ──────────────────────────────────────────────────

  describe('manual codes tolerated', () => {
    it('ignores manual codes outside the target range', async () => {
      // e.g. a stray/legacy code like '12345' sitting on this chartOwnerKey
      // must not corrupt the expense-range allocation.
      await build(['12345', '70000']);
      const code = await service.getNextAccountCode({
        ownerType: OwnerType.ACCOUNTANT,
        type: 'expense',
        chartOwnerKey: 'ACCOUNTANT_agent1',
      });
      expect(code).toBe('70010');
    });

    it('jumps forward from a manual in-range off-grid code without colliding', async () => {
      await build(['70005']); // manually entered, not on the jump-10 grid
      const code = await service.getNextAccountCode({
        ownerType: OwnerType.ACCOUNTANT,
        type: 'expense',
        chartOwnerKey: 'ACCOUNTANT_agent1',
      });
      expect(code).toBe('70015');
    });
  });

  // ── error handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws for a type with no allocatable range', async () => {
      await build([]);
      await expect(
        service.getNextAccountCode({
          ownerType: OwnerType.SYSTEM,
          type: 'asset' as any,
          chartOwnerKey: 'SYSTEM',
        }),
      ).rejects.toThrow('No allocatable account code range');
    });

    it('throws when the range is exhausted', async () => {
      await build(['69999']);
      await expect(
        service.getNextAccountCode({
          ownerType: OwnerType.SYSTEM,
          type: 'expense',
          chartOwnerKey: 'SYSTEM',
        }),
      ).rejects.toThrow('is exhausted');
    });
  });

  // ── EntityManager override ──────────────────────────────────────────────────

  describe('EntityManager override', () => {
    it('uses the repository from a caller-supplied manager instead of the injected one', async () => {
      await build(['60000']); // injected repo — must NOT be consulted
      const managerRepo = makeRepo(['60000', '60010']);
      const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) } as unknown as EntityManager;

      const code = await service.getNextAccountCode(
        { ownerType: OwnerType.SYSTEM, type: 'expense', chartOwnerKey: 'SYSTEM' },
        manager,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(BookingAccount);
      expect(managerRepo.find).toHaveBeenCalled();
      expect(bookingAccountRepo.find).not.toHaveBeenCalled();
      expect(code).toBe('60020');
    });
  });
});
