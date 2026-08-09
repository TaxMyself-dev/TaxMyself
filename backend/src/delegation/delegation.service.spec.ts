/**
 * Unit tests: DelegationService referral-signup methods (Phase 1.1).
 *
 * Covers: lazy referral-code generation (idempotent, race-safe on both the
 * "same accountant, concurrent calls" and "code collides with someone
 * else's" paths) and the public referral-info lookup.
 */
import { NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { DelegationService } from './delegation.service';

describe('DelegationService — referral signup', () => {
  let service: DelegationService;
  let delegationRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let userRepo: { findOne: jest.Mock; createQueryBuilder: jest.Mock };

  function makeQueryBuilder(executeResult: { affected: number }) {
    const qb: any = {};
    qb.update = jest.fn().mockReturnValue(qb);
    qb.set = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.execute = jest.fn().mockResolvedValue(executeResult);
    return qb;
  }

  beforeEach(() => {
    delegationRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    userRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };

    // DelegationService's constructor eagerly calls admin.auth() — mock it
    // the same way firebase-auth.guard.spec.ts does, since no Firebase app
    // is initialized in the unit-test process.
    jest.spyOn(admin, 'auth').mockReturnValue({} as any);

    service = new DelegationService(
      delegationRepo as any,
      userRepo as any,
      {} as any, // businessRepository — unused by these methods
      {} as any, // mailService — unused by these methods
      {} as any, // usersService — unused by these methods
      {} as any, // dataSource — unused by these methods
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getOrCreateReferralCode', () => {
    it('returns the existing code without writing when already set', async () => {
      userRepo.findOne.mockResolvedValue({ firebaseId: 'acc-1', referralCode: 'ABC12345' });
      await expect(service.getOrCreateReferralCode('acc-1')).resolves.toBe('ABC12345');
      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the accountant does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getOrCreateReferralCode('missing')).rejects.toThrow(NotFoundException);
    });

    it('generates and persists a new 8-char code on first call', async () => {
      userRepo.findOne.mockResolvedValueOnce({ firebaseId: 'acc-1', referralCode: null });
      const qb = makeQueryBuilder({ affected: 1 });
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const code = await service.getOrCreateReferralCode('acc-1');
      expect(typeof code).toBe('string');
      expect(code).toHaveLength(8);
      expect(qb.set).toHaveBeenCalledWith({ referralCode: code });
      expect(qb.andWhere).toHaveBeenCalledWith('referralCode IS NULL');
    });

    it('returns the winning code when a concurrent call for the SAME accountant already set it', async () => {
      userRepo.findOne
        .mockResolvedValueOnce({ firebaseId: 'acc-1', referralCode: null }) // initial read
        .mockResolvedValueOnce({ firebaseId: 'acc-1', referralCode: 'WINNER1' }); // re-fetch after affected=0
      const qb = makeQueryBuilder({ affected: 0 });
      userRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getOrCreateReferralCode('acc-1')).resolves.toBe('WINNER1');
    });

    it('retries on a dup-key collision with a DIFFERENT accountant\'s code', async () => {
      userRepo.findOne.mockResolvedValueOnce({ firebaseId: 'acc-1', referralCode: null });
      const failingQb = makeQueryBuilder({ affected: 1 });
      failingQb.execute = jest.fn().mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
      const succeedingQb = makeQueryBuilder({ affected: 1 });
      userRepo.createQueryBuilder
        .mockReturnValueOnce(failingQb)
        .mockReturnValueOnce(succeedingQb);

      const code = await service.getOrCreateReferralCode('acc-1');
      expect(typeof code).toBe('string');
      expect(userRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    });
  });

  describe('getReferralInfo', () => {
    it('returns the accountant display name only', async () => {
      userRepo.findOne.mockResolvedValue({ fName: 'דנה', lName: 'כהן', email: 'dana@example.com' });
      await expect(service.getReferralInfo('CODE1234')).resolves.toEqual({ accountantName: 'דנה כהן' });
    });

    it('throws NotFoundException for an unknown code', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getReferralInfo('bad-code')).rejects.toThrow(NotFoundException);
    });
  });
});
