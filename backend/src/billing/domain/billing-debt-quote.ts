import { createHash } from 'crypto';
import { BillingObligation } from '../entities/billing-obligation.entity';

export function billingDebtQuote(debts: BillingObligation[]): string {
  return createHash('sha256').update(JSON.stringify([...debts].sort((a,b) => a.id-b.id).map(debt => [
    debt.id, debt.planId, debt.currency, debt.periodStart, debt.periodEnd,
    debt.amountAgorot, debt.amountBeforeVatAgorot, debt.vatAmountAgorot,
  ]))).digest('hex');
}
