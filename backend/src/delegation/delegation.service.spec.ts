/**
 * Unit tests: DelegationService referral-signup methods (Phase 1.1/1.4).
 *
 * Covers: lazy referral-code generation (idempotent, race-safe on both the
 * "same accountant, concurrent calls" and "code collides with someone
 * else's" paths), the public referral-info lookup, and existing-user
 * consent (self-referral rejected, dedup on an existing delegation row,
 * full-scope ACTIVE delegation created otherwise).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { DelegationService } from './delegation.service';
import { DelegationStatus, DelegationScope } from './delegation.entity';

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

  describe('consentToReferral', () => {
    it('throws NotFoundException for an unknown code', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.consentToReferral('user-1', 'bad-code')).rejects.toThrow(NotFoundException);
    });

    it('rejects self-referral', async () => {
      userRepo.findOne.mockResolvedValue({ firebaseId: 'user-1', fName: 'X' });
      await expect(service.consentToReferral('user-1', 'CODE1234')).rejects.toThrow(BadRequestException);
    });

    it('is a no-op (no new row) when a delegation already exists for this pair', async () => {
      userRepo.findOne.mockResolvedValue({ firebaseId: 'acc-1', fName: 'דנה', lName: 'כהן' });
      delegationRepo.findOne.mockResolvedValue({ id: 1 });

      const result = await service.consentToReferral('user-1', 'CODE1234');
      expect(result.message).toBe('הגישה לרואה החשבון כבר קיימת');
      expect(delegationRepo.save).not.toHaveBeenCalled();
    });

    it('creates an ACTIVE full-scope delegation when none exists, including EXPENSES_APPROVE', async () => {
      userRepo.findOne.mockResolvedValue({ firebaseId: 'acc-1', fName: 'דנה', lName: 'כהן' });
      delegationRepo.findOne.mockResolvedValue(null);

      await service.consentToReferral('user-1', 'CODE1234');
      expect(delegationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          agentId: 'acc-1',
          status: DelegationStatus.ACTIVE,
          // EXPENSES_APPROVE is always granted, regardless of the client's
          // chosen document scopes — see DelegationScope's doc comment.
          scopes: [DelegationScope.DOCUMENTS_READ, DelegationScope.DOCUMENTS_WRITE, DelegationScope.EXPENSES_APPROVE],
        }),
      );
    });
  });

  describe('revokeDelegation', () => {
    it('flips an owner-held ACTIVE delegation to REVOKED', async () => {
      const row = { id: 42, userId: 'client-1', agentId: 'acc-1', status: DelegationStatus.ACTIVE };
      delegationRepo.findOne.mockResolvedValue(row);

      await service.revokeDelegation('client-1', 42);

      expect(delegationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 42, status: DelegationStatus.REVOKED }),
      );
    });

    it('throws NotFoundException when the delegation does not exist', async () => {
      delegationRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeDelegation('client-1', 999)).rejects.toThrow(NotFoundException);
      expect(delegationRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the delegation belongs to a different owner (never leaks a 403)', async () => {
      delegationRepo.findOne.mockResolvedValue({
        id: 42,
        userId: 'someone-else',
        agentId: 'acc-1',
        status: DelegationStatus.ACTIVE,
      });
      await expect(service.revokeDelegation('client-1', 42)).rejects.toThrow(NotFoundException);
      expect(delegationRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when already REVOKED', async () => {
      delegationRepo.findOne.mockResolvedValue({
        id: 42,
        userId: 'client-1',
        agentId: 'acc-1',
        status: DelegationStatus.REVOKED,
      });
      await expect(service.revokeDelegation('client-1', 42)).rejects.toThrow(BadRequestException);
      expect(delegationRepo.save).not.toHaveBeenCalled();
    });
  });
});
