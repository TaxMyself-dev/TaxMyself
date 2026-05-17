/**
 * Unit tests for the transaction-locking trigger added to
 * AnnualReportService.setReported. The tests target the private
 * lockAnnualTransactions / unlockAnnualTransactions methods directly.
 */

import { AnnualReportService } from './annual-report.service';
import { AnnualReport, AnnualReportStatus } from './annual-report.entity';
import { Business } from 'src/business/business.entity';
import { BusinessType, VATReportingType } from 'src/enum';

function makeReport(overrides: Partial<AnnualReport> = {}): AnnualReport {
  return {
    id: 1,
    clientFirebaseId: 'client-uid',
    businessNumber: '999',
    taxYear: 2024,
    status: AnnualReportStatus.READY_TO_PREPARE,
    answers: null,
    requiredCategories: null,
    finishedAt: null,
    reportedAt: null,
    reportedByAccountantFirebaseId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AnnualReport;
}

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 1,
    firebaseId: 'client-uid',
    businessName: 'Test',
    businessField: null,
    businessNumber: '999',
    businessAddress: null,
    businessPhone: null,
    businessEmail: null,
    businessType: BusinessType.LICENSED,
    businessInventory: null,
    businessDate: null,
    vatReportingType: VATReportingType.MONTHLY_REPORT,
    taxReportingType: null,
    nationalInsRequired: null,
    advanceTaxPercent: null,
    shaamAccessToken: null,
    shaamAccessTokenExp: null,
    shaamRefreshToken: null,
    createdAt: new Date(),
    ...overrides,
  } as Business;
}

interface ServiceWithDeps {
  service: AnnualReportService;
  businessRepo: { findOne: jest.Mock };
  slimRepo: {
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
    qb: {
      innerJoin: jest.Mock;
      select: jest.Mock;
      where: jest.Mock;
      andWhere: jest.Mock;
      getRawMany: jest.Mock;
    };
  };
  cacheRepo: { update: jest.Mock };
}

function buildService(opts: {
  business?: Business | null;
  lockableIds?: string[];
} = {}): ServiceWithDeps {
  // Distinguish "caller didn't pass" (use default) from "caller explicitly passed null".
  const businessValue = 'business' in opts ? opts.business : makeBusiness();
  const businessRepo = {
    findOne: jest.fn().mockResolvedValue(businessValue),
  };

  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(
      (opts.lockableIds ?? ['ext-1']).map((externalTransactionId) => ({
        externalTransactionId,
      })),
    ),
  };
  const slimRepo = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    qb,
  };
  const cacheRepo = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const service = new AnnualReportService(
    {} as any, // reportRepo
    {} as any, // fileRepo
    {} as any, // delegationRepo
    businessRepo as any,
    {} as any, // taskRepo
    slimRepo as any,
    cacheRepo as any,
  );

  return { service, businessRepo, slimRepo, cacheRepo };
}

describe('AnnualReportService – transaction lock trigger', () => {
  describe('lockAnnualTransactions', () => {
    it('locks only vatPercent=0 rows when business is LICENSED', async () => {
      const { service, slimRepo } = buildService({
        business: makeBusiness({ businessType: BusinessType.LICENSED }),
        lockableIds: ['ext-1', 'ext-2'],
      });

      await (service as any).lockAnnualTransactions(makeReport());

      // The vatPercent=0 filter is the marker that the LICENSED branch was taken.
      expect(slimRepo.qb.andWhere).toHaveBeenCalledWith('slim.vatPercent = 0');
      expect(slimRepo.update).toHaveBeenCalledTimes(1);
      const [filter, patch] = slimRepo.update.mock.calls[0];
      expect(filter.userId).toBe('client-uid');
      expect(filter.externalTransactionId._value).toEqual(['ext-1', 'ext-2']);
      expect(patch).toEqual({ vatReportingDate: '2024', isLocked: true });
    });

    it('locks ALL transactions (no vatPercent filter) when business is EXEMPT', async () => {
      const { service, slimRepo } = buildService({
        business: makeBusiness({ businessType: BusinessType.EXEMPT }),
        lockableIds: ['ext-1', 'ext-2', 'ext-3'],
      });

      await (service as any).lockAnnualTransactions(makeReport());

      expect(slimRepo.qb.andWhere).not.toHaveBeenCalledWith('slim.vatPercent = 0');
      const [, patch] = slimRepo.update.mock.calls[0];
      expect(patch).toEqual({ vatReportingDate: '2024', isLocked: true });
    });

    it('filters by tax year boundaries on the cache date column', async () => {
      const { service, slimRepo } = buildService();

      await (service as any).lockAnnualTransactions(makeReport({ taxYear: 2024 }));

      const dateCall = slimRepo.qb.andWhere.mock.calls.find(
        ([clause]: [string]) =>
          typeof clause === 'string' && clause.includes('cache.transactionDate'),
      );
      expect(dateCall).toBeDefined();
      const args = dateCall![1];
      expect(args.start).toEqual(new Date(Date.UTC(2024, 0, 1)));
      expect(args.end).toEqual(new Date(Date.UTC(2024, 11, 31, 23, 59, 59)));
    });

    it('skips the bulk update when no rows are eligible', async () => {
      const { service, slimRepo } = buildService({ lockableIds: [] });

      await (service as any).lockAnnualTransactions(makeReport());

      expect(slimRepo.update).not.toHaveBeenCalled();
    });

    it('returns silently when the business cannot be found', async () => {
      const { service, slimRepo } = buildService({ business: null });

      await (service as any).lockAnnualTransactions(makeReport());

      expect(slimRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('unlockAnnualTransactions', () => {
    it('clears the isLocked flag scoped to the tax year label', async () => {
      const { service, slimRepo } = buildService();

      await (service as any).unlockAnnualTransactions(makeReport({ taxYear: 2024 }));

      expect(slimRepo.update).toHaveBeenCalledTimes(1);
      const [filter, patch] = slimRepo.update.mock.calls[0];
      expect(filter).toEqual({
        userId: 'client-uid',
        businessNumber: '999',
        vatReportingDate: '2024',
      });
      // Unlock only flips isLocked off — the year stamp stays put.
      expect(patch).toEqual({ isLocked: false });
    });
  });
});
