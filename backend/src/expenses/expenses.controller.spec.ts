/**
 * Unit tests: ExpensesController supplier create/edit — EXPENSES_APPROVE scope
 *
 * Bug fix: the report-review "ספק חדש"/edit-supplier dialog was gated by the
 * generic per-verb DOCUMENTS_WRITE default, so an accountant on a view-only
 * delegation (EXPENSES_APPROVE only, no DOCUMENTS_WRITE — the norm since the
 * EXPENSES_APPROVE migration) got a 403 trying to save a supplier a pending
 * expense needed. Fixed by overriding both routes to @RequiredDelegationScope
 * (EXPENSES_APPROVE), same mechanism already used on the review approve-*
 * endpoints (see firebase-auth.guard.spec.ts's "EXPENSES_APPROVE scope"
 * block for the generic guard-level proof this mechanism works).
 */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExpensesController } from './expenses.controller';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { SubscriptionGuard } from '../guards/subscription.guard';
import { REQUIRED_DELEGATION_SCOPE_KEY } from '../decorators/required-delegation-scope.decorator';
import { DelegationScope } from '../delegation/delegation.entity';

describe('ExpensesController — supplier create/edit scope', () => {
  let controller: ExpensesController;
  let expensesService: {
    addSupplier: jest.Mock;
    updateSupplier: jest.Mock;
    getExpensesForVatReport: jest.Mock;
  };

  beforeEach(() => {
    expensesService = {
      addSupplier: jest.fn().mockResolvedValue({ id: 1 }),
      updateSupplier: jest.fn().mockResolvedValue({ id: 1 }),
      getExpensesForVatReport: jest.fn().mockResolvedValue([]),
    };
    controller = new ExpensesController(
      expensesService as any,
      {} as any,
      { convertStringToDateObject: jest.fn((value) => new Date(value)) } as any,
      {} as any,
    );
  });

  function req(firebaseId: string, businessNumber?: string) {
    return { user: { firebaseId, businessNumber } } as any;
  }

  describe('addSupplier (POST /expenses/add-supplier)', () => {
    it('is protected by FirebaseAuthGuard + SubscriptionGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller.addSupplier);
      expect(guards).toContain(FirebaseAuthGuard);
      expect(guards).toContain(SubscriptionGuard);
    });

    it('requires EXPENSES_APPROVE, not the generic DOCUMENTS_WRITE default — so a view-only delegation can save a supplier', () => {
      const requiredScope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, controller.addSupplier);
      expect(requiredScope).toBe(DelegationScope.EXPENSES_APPROVE);
    });

    it('delegates to the service with the impersonated (client) firebaseId', async () => {
      await controller.addSupplier(req('client-1', '123456789'), { name: 'ספק חדש' });
      expect(expensesService.addSupplier).toHaveBeenCalledWith({ name: 'ספק חדש' }, 'client-1', '123456789');
    });
  });

  describe('updateSupplier (PATCH /expenses/update-supplier/:id)', () => {
    it('is protected by FirebaseAuthGuard + SubscriptionGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller.updateSupplier);
      expect(guards).toContain(FirebaseAuthGuard);
      expect(guards).toContain(SubscriptionGuard);
    });

    it('requires EXPENSES_APPROVE, not the generic DOCUMENTS_WRITE default', () => {
      const requiredScope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, controller.updateSupplier);
      expect(requiredScope).toBe(DelegationScope.EXPENSES_APPROVE);
    });

    it('delegates to the service with the impersonated (client) firebaseId', async () => {
      await controller.updateSupplier(req('client-1'), 7, { name: 'עודכן' } as any);
      expect(expensesService.updateSupplier).toHaveBeenCalledWith(7, 'client-1', { name: 'עודכן' });
    });
  });

  describe('deleteSupplier — unaffected by this fix (still the generic DOCUMENTS_WRITE default)', () => {
    it('has no @RequiredDelegationScope override', () => {
      const requiredScope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, controller.deleteSupplier);
      expect(requiredScope).toBeUndefined();
    });
  });

  describe('getExpensesByMonthReport display contract', () => {
    it('aliases immutable equipment/depreciation snapshots for the expenses table', async () => {
      expensesService.getExpensesForVatReport.mockResolvedValue([
        {
          id: 17,
          vatPercentSnapshot: '100.00',
          taxPercentSnapshot: '0.00',
          isEquipmentSnapshot: true,
          reductionPercentSnapshot: '33.33',
        },
      ]);

      const result = await controller.getExpensesByMonthReport(
        req('client-1'),
        {
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          businessNumber: '123456789',
        },
      );

      expect(result).toEqual([
        expect.objectContaining({
          id: 17,
          vatPercent: 100,
          taxPercent: 0,
          isEquipment: true,
          reductionPercent: 33.33,
        }),
      ]);
    });
  });
});
