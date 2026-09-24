import 'reflect-metadata';
import { BillingModule } from './billing.module';
import { BILLING_CARD_COM_EXECUTOR } from './services/billing-provider-runtime.service';
import { BillingCardcomExecutorService } from './services/billing-cardcom-executor.service';
import { BillingHostedCompletionService } from './services/billing-hosted-completion.service';

describe('BillingModule wiring', () => {
  const providers =
    (Reflect.getMetadata('providers', BillingModule) as unknown[]) ?? [];

  it('registers the concrete CardCom executor as a provider', () => {
    expect(providers).toContain(BillingCardcomExecutorService);
  });

  it('registers the local hosted-capture completion service used by the webhook and the renewal sweep', () => {
    expect(providers).toContain(BillingHostedCompletionService);
  });

  it('binds BILLING_CARD_COM_EXECUTOR to the concrete CardCom executor, not a stub', () => {
    const binding = providers.find(
      (provider): provider is { provide: unknown; useExisting: unknown } =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        (provider as { provide: unknown }).provide ===
          BILLING_CARD_COM_EXECUTOR,
    );

    expect(binding).toBeDefined();
    expect(binding?.useExisting).toBe(BillingCardcomExecutorService);
  });
});
