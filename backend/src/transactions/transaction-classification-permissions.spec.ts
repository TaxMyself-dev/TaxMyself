import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { ALLOW_REPRESENTED_CLIENT_SUBMISSION_KEY } from '../decorators/allow-represented-client-submission.decorator';
import { REQUIRED_DELEGATION_SCOPE_KEY } from '../decorators/required-delegation-scope.decorator';
import { DelegationScope } from '../delegation/delegation.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionProcessingService } from './transaction-processing.service';

describe('represented client transaction classification', () => {
  it.each(['classifyTransaction', 'quickClassifyTransaction'] as const)(
    '%s permits owner classification while retaining accountant delegation scope',
    (method) => {
      const handler = TransactionsController.prototype[method];
      expect(Reflect.getMetadata(ALLOW_REPRESENTED_CLIENT_SUBMISSION_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, handler)).toBe(DelegationScope.EXPENSES_APPROVE);
    },
  );

  it.each(['classifyManually', 'classifyWithRule'] as const)(
    '%s rejects a represented owner changing a confirmed transaction before any write',
    async (method) => {
      const service = Object.create(TransactionProcessingService.prototype) as TransactionProcessingService;
      const cacheRepo = { findOne: jest.fn().mockResolvedValue({ billId: 1 }) };
      const slimRepo = { findOne: jest.fn().mockResolvedValue({ confirmed: true }), save: jest.fn() };
      Object.assign(service, { cacheRepo, slimRepo });

      await expect((service[method] as any).call(service, 'owner', { externalTransactionId: 'tx-1' }, true))
        .rejects.toThrow(ConflictException);
      expect(slimRepo.save).not.toHaveBeenCalled();
    },
  );
});
