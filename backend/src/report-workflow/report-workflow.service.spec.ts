/**
 * Unit tests for the transaction-locking trigger added to
 * ReportWorkflowService.setReported. The tests target the private
 * lockTransactionsIfApplicable / unlockTransactionsIfApplicable methods
 * directly to keep the setup focused.
 */

import { ReportWorkflowService } from './report-workflow.service';
import {
  ReportWorkflow,
  ReportWorkflowStatus,
  ReportWorkflowType,
} from './report-workflow.entity';
import { Business } from 'src/business/business.entity';
import { BusinessType, VATReportingType } from 'src/enum';

function makeWorkflow(overrides: Partial<ReportWorkflow> = {}): ReportWorkflow {
  return {
    id: 1,
    clientFirebaseId: 'client-uid',
    businessNumber: '999',
    type: ReportWorkflowType.VAT_REPORT,
    periodStart: new Date('2024-03-01'),
    periodEnd: new Date('2024-03-31'),
    status: ReportWorkflowStatus.READY_TO_PREPARE,
    clientConfirmedAt: null,
    clientConfirmedBy: null,
    reportedAt: null,
    reportedByAccountantFirebaseId: null,
    reportedSource: null,
    notes: null,
    dismissedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ReportWorkflow;
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
  service: ReportWorkflowService;
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
  sharedService: { getVATReportingDate: jest.Mock };
}

function buildService(opts: {
  business?: Business | null;
  lockableIds?: string[];
  periodLabel?: string;
} = {}): ServiceWithDeps {
  const businessRepo = { findOne: jest.fn().mockResolvedValue(opts.business ?? makeBusiness()) };

  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(
      (opts.lockableIds ?? ['ext-1', 'ext-2']).map((externalTransactionId) => ({
        externalTransactionId,
      })),
    ),
  };
  const slimRepo = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    qb,
  };

  const sharedService = {
    getVATReportingDate: jest.fn().mockReturnValue(opts.periodLabel ?? '3/2024'),
  };

  const cacheRepo = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  // Other dependencies are not used by the lock methods.
  const service = new ReportWorkflowService(
    {} as any, // workflowRepo
    {} as any, // delegationRepo
    businessRepo as any,
    {} as any, // taskRepo
    slimRepo as any,
    cacheRepo as any,
    {} as any, // notifications
    {} as any, // tasksGenerator
    sharedService as any,
  );

  return { service, businessRepo, slimRepo, cacheRepo, sharedService };
}

describe('ReportWorkflowService – transaction lock trigger', () => {
  describe('lockTransactionsIfApplicable', () => {
    it('locks VAT-eligible transactions for a LICENSED + MONTHLY business', async () => {
      const { service, slimRepo, sharedService } = buildService({
        lockableIds: ['ext-1', 'ext-2'],
        periodLabel: '3/2024',
      });
      const workflow = makeWorkflow();

      await (service as any).lockTransactionsIfApplicable(workflow);

      expect(sharedService.getVATReportingDate).toHaveBeenCalledWith(
        new Date('2024-03-01'),
        VATReportingType.MONTHLY_REPORT,
      );
      expect(slimRepo.qb.where).toHaveBeenCalledWith(
        'slim.userId = :userId',
        { userId: 'client-uid' },
      );
      // Ensures we filter to VAT-eligible rows only.
      expect(slimRepo.qb.andWhere).toHaveBeenCalledWith('slim.vatPercent > 0');
      // Ensures we never re-lock rows that already carry a label.
      expect(slimRepo.qb.andWhere).toHaveBeenCalledWith('slim.vatReportingDate IS NULL');
      expect(slimRepo.update).toHaveBeenCalledTimes(1);
      const [filter, patch] = slimRepo.update.mock.calls[0];
      expect(filter.userId).toBe('client-uid');
      // Repository.In() builds a FindOperator — verify the embedded value.
      expect(filter.externalTransactionId._value).toEqual(['ext-1', 'ext-2']);
      expect(patch).toEqual({ vatReportingDate: '3/2024' });
    });

    it('is a no-op for ADVANCE_TAX workflows', async () => {
      const { service, businessRepo, slimRepo } = buildService();
      const workflow = makeWorkflow({ type: ReportWorkflowType.ADVANCE_TAX });

      await (service as any).lockTransactionsIfApplicable(workflow);

      expect(businessRepo.findOne).not.toHaveBeenCalled();
      expect(slimRepo.update).not.toHaveBeenCalled();
    });

    it('is a no-op for an EXEMPT business', async () => {
      const { service, slimRepo } = buildService({
        business: makeBusiness({ businessType: BusinessType.EXEMPT }),
      });

      await (service as any).lockTransactionsIfApplicable(makeWorkflow());

      expect(slimRepo.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the business does not file VAT', async () => {
      const { service, slimRepo } = buildService({
        business: makeBusiness({ vatReportingType: VATReportingType.NOT_REQUIRED }),
      });

      await (service as any).lockTransactionsIfApplicable(makeWorkflow());

      expect(slimRepo.update).not.toHaveBeenCalled();
    });

    it('skips the bulk update when no rows are eligible', async () => {
      const { service, slimRepo } = buildService({ lockableIds: [] });

      await (service as any).lockTransactionsIfApplicable(makeWorkflow());

      expect(slimRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('unlockTransactionsIfApplicable', () => {
    it('clears vatReportingDate scoped to the workflow period label', async () => {
      const { service, slimRepo } = buildService({ periodLabel: '3/2024' });

      await (service as any).unlockTransactionsIfApplicable(makeWorkflow());

      expect(slimRepo.update).toHaveBeenCalledTimes(1);
      const [filter, patch] = slimRepo.update.mock.calls[0];
      expect(filter).toEqual({
        userId: 'client-uid',
        businessNumber: '999',
        vatReportingDate: '3/2024',
      });
      expect(patch).toEqual({ vatReportingDate: null });
    });

    it('is a no-op for ADVANCE_TAX workflows', async () => {
      const { service, slimRepo } = buildService();
      const workflow = makeWorkflow({ type: ReportWorkflowType.ADVANCE_TAX });

      await (service as any).unlockTransactionsIfApplicable(workflow);

      expect(slimRepo.update).not.toHaveBeenCalled();
    });
  });
});
