import 'reflect-metadata';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { Documents } from '../../documents/documents.entity';
import { BillingAttempt } from './billing-attempt.entity';
import { BillingEvent } from './billing-event.entity';
import { BillingObligation } from './billing-obligation.entity';
import { PaymentMethod } from './payment-method.entity';
import { PaymentMethodUpdateAttempt } from './payment-method-update-attempt.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { Subscription } from './subscription.entity';

describe('billing persistence metadata', () => {
  const storage = getMetadataArgsStorage();

  function column(target: Function, propertyName: string) {
    return storage.columns.find(
      (candidate) =>
        candidate.target === target && candidate.propertyName === propertyName,
    );
  }

  function indexNames(target: Function): string[] {
    return storage.indices
      .filter((candidate) => candidate.target === target)
      .map((candidate) => candidate.name ?? '');
  }

  it('keeps CardCom ExternalUniqTranId immutable-sized and uniquely indexed', () => {
    expect(
      column(BillingAttempt, 'cardcomExternalUniqTranId')?.options.length,
    ).toBe(25);
    expect(indexNames(BillingAttempt)).toContain(
      'ux_billing_attempt_external_uniq',
    );
  });

  it('makes one obligation canonical and protects nullable attempt pointers', () => {
    expect(indexNames(BillingObligation)).toEqual(
      expect.arrayContaining([
        'ux_billing_obligation_key',
        'ux_billing_obligation_active_attempt',
        'ux_billing_obligation_satisfied_attempt',
      ]),
    );
  });

  it('keeps token material out of the payment-method update attempt', () => {
    expect(column(PaymentMethodUpdateAttempt, 'cardcomToken')).toBeUndefined();
    expect(
      column(PaymentMethodUpdateAttempt, 'cardcomLowProfileId')?.options.length,
    ).toBe(255);
    expect(
      column(PaymentMethodUpdateAttempt, 'publicToken')?.options.length,
    ).toBe(191);
  });

  it('builds complete TypeORM metadata for all new relations without connecting to a database', async () => {
    const dataSource = new DataSource({
      type: 'mysql',
      database: 'metadata_only',
      entities: [
        Subscription,
        SubscriptionPlan,
        PaymentMethod,
        Documents,
        BillingObligation,
        BillingAttempt,
        PaymentMethodUpdateAttempt,
        BillingEvent,
      ],
    });

    await (
      dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();

    expect(
      dataSource
        .getMetadata(BillingObligation)
        .foreignKeys.map((fk) => fk.name),
    ).toEqual(
      expect.arrayContaining([
        'fk_billing_obligation_subscription',
        'fk_billing_obligation_plan',
        'fk_billing_obligation_active_attempt',
        'fk_billing_obligation_satisfied_attempt',
      ]),
    );
    expect(
      dataSource.getMetadata(BillingEvent).foreignKeys.map((fk) => fk.name),
    ).toEqual(
      expect.arrayContaining([
        'fk_billing_event_obligation',
        'fk_billing_event_attempt',
        'fk_billing_event_payment_method_update',
      ]),
    );
  });
});
