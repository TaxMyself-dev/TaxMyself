import { assertCardcomNetworkAllowed, assertDevCompletionEnvironment, devCompletionScheduleOptions, isAllowedDevCompletionRequest } from './dev-completion-mode';
import { CardcomService } from '../services/cardcom.service';

describe('isolated dev completion runtime', () => {
  let previous: NodeJS.ProcessEnv;
  beforeEach(() => { previous = { ...process.env }; Object.assign(process.env, {
    BILLING_DEV_COMPLETION_ONLY: 'true', DB_DATABASE: 'keepintax-dev', BILLING_TASKS_PROJECT_ID: 'keepintax-dev',
    BILLING_TASKS_EXPECTED_DATABASE: 'keepintax-dev', DISABLE_SYNCHRONIZE: 'true', SKIP_BOOT_SEED: 'true',
  }); });
  afterEach(() => { process.env = previous; });
  it('requires a dev DB/project and suppresses schema/seed/background tasks', () => {
    expect(() => assertDevCompletionEnvironment()).not.toThrow();
    expect(devCompletionScheduleOptions()).toEqual({ cronJobs: false, intervals: false, timeouts: false });
    for (const field of ['DB_DATABASE', 'BILLING_TASKS_PROJECT_ID', 'BILLING_TASKS_EXPECTED_DATABASE', 'DISABLE_SYNCHRONIZE', 'SKIP_BOOT_SEED']) {
      const current = process.env[field]; process.env[field] = 'wrong';
      expect(() => assertDevCompletionEnvironment()).toThrow(); process.env[field] = current;
    }
  });
  it('exposes health and authenticated task routes only, blocking ordinary charge/webhook/manual-task routes', () => {
    expect(isAllowedDevCompletionRequest('GET', '/')).toBe(true);
    expect(isAllowedDevCompletionRequest('POST', '/internal/billing/completion')).toBe(true);
    expect(isAllowedDevCompletionRequest('POST', '/internal/billing/repair')).toBe(true);
    for (const path of ['/billing/checkout', '/billing/cardcom/webhook', '/daily-task', '/admin/billing/subscriptions/52/renew', '/feezback/sync']) {
      expect(isAllowedDevCompletionRequest('POST', path)).toBe(false);
    }
  });
  it('honors the global schedule disable switch outside the completion profile', () => {
    process.env.BILLING_DEV_COMPLETION_ONLY = 'false';
    process.env.DISABLE_SCHEDULED_TASKS = 'true';
    expect(devCompletionScheduleOptions()).toEqual({ cronJobs: false, intervals: false, timeouts: false });
  });
  it('preserves normal behavior when the profile is disabled', () => {
    delete process.env.DISABLE_SCHEDULED_TASKS;
    process.env.BILLING_DEV_COMPLETION_ONLY = 'false';
    expect(devCompletionScheduleOptions()).toEqual({}); expect(() => assertCardcomNetworkAllowed()).not.toThrow();
    expect(isAllowedDevCompletionRequest('POST', '/billing/checkout')).toBe(true);
  });
  it('blocks every CardCom entry point before any HTTP call, including lookup/refund paths', async () => {
    const post = jest.fn(); const service = new CardcomService({ post } as any);
    expect(() => service.onModuleInit()).not.toThrow();
    const requests = [
      () => service.createLowProfileCheckout({} as any), () => service.chargeByToken({} as any),
      () => service.getLowProfileResult('id'), () => service.getTransactionByExternalUniqTran('id'),
      () => service.getTransactionInfoById(1), () => service.refundTransaction({} as any),
      () => service.listRefundEvidence(new Date(), new Date()),
    ];
    for (const request of requests) await expect(request()).rejects.toThrow('CardCom network access is disabled');
    expect(post).not.toHaveBeenCalled();
  });
});
