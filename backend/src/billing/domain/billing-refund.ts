import { BillingAttemptStatus } from '../enums/billing.enums';

export const REFUND_RESERVED_STATUSES = [BillingAttemptStatus.CREATED, BillingAttemptStatus.PROCESSING,
  BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.MANUAL_REVIEW, BillingAttemptStatus.CAPTURED,
  BillingAttemptStatus.COMPLETED];

/** Cumulative rounding returns the exact original net/VAT on the final partial refund. */
export function refundBreakdown(gross: number, net: number, previousGross: number, previousNet: number, amount: number) {
  if (![gross, net, previousGross, previousNet, amount].every(Number.isSafeInteger) || gross <= 0 ||
    net < 0 || net > gross || previousGross < 0 || previousNet < 0 || previousNet > net ||
    amount <= 0 || previousGross + amount > gross) throw new Error('Invalid refund balance');
  const numerator = BigInt(previousGross + amount) * BigInt(net);
  const denominator = BigInt(gross);
  const nextNet = Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2)));
  const refundNet = nextNet - previousNet;
  if (refundNet < 0 || refundNet > amount) throw new Error('Invalid refund VAT balance');
  return { amountAgorot: amount, amountBeforeVatAgorot: refundNet, vatAmountAgorot: amount - refundNet };
}
