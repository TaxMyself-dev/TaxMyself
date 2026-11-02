import { BillingTasksService } from './billing-tasks.service';
import { BillingTaskController, BillingTaskGuard } from '../billing-task.controller';
import { BillingEventService } from './billing-event.service';
import { BillingEventType } from '../enums/billing.enums';

describe('Cloud Tasks transport and verified identity', () => {
  let previous: NodeJS.ProcessEnv;
  const now = new Date('2026-11-02T10:00:00Z');
  function fixture() {
    const transport = { create: jest.fn().mockResolvedValue(undefined), verify: jest.fn().mockResolvedValue({
      aud: 'https://dev.example.com', iss: 'https://accounts.google.com', email: process.env.BILLING_TASKS_SERVICE_ACCOUNT,
      email_verified: true, sub: 'verified-subject', exp: now.getTime() / 1000 + 3600,
    }) };
    const service = new BillingTasksService({ options: { database: 'keepintax-dev' } } as any, transport);
    return { service, transport };
  }
  beforeEach(() => {
    previous = { ...process.env };
    Object.assign(process.env, { BILLING_TASKS_ENABLED: 'true', BILLING_TASKS_PROJECT_ID: 'keepintax-dev',
      BILLING_TASKS_LOCATION: 'me-west1', BILLING_TASKS_QUEUE: 'billing-completion-dev',
      BILLING_TASKS_TARGET_URL: 'https://dev.example.com/internal/billing/completion',
      BILLING_TASKS_AUDIENCE: 'https://dev.example.com',
      BILLING_TASKS_SERVICE_ACCOUNT: 'billing-worker@keepintax-dev.iam.gserviceaccount.com',
      BILLING_TASKS_EXPECTED_DATABASE: 'keepintax-dev' });
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => { process.env = previous; jest.useRealTimers(); });

  it('creates a deterministic authenticated task containing ids only; daily generations can replace exhausted/tombstoned tasks', async () => {
    const { service, transport } = fixture(); service.onModuleInit();
    await service.enqueue('CAPTURE', 3, now, 'v1');
    await service.enqueue('CAPTURE', 3, now, 'v1');
    const [parent, task] = transport.create.mock.calls[0];
    expect(parent).toBe('projects/keepintax-dev/locations/me-west1/queues/billing-completion-dev');
    expect(JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString())).toEqual({ kind: 'CAPTURE', id: 3 });
    expect(task.httpRequest.oidcToken).toEqual({ serviceAccountEmail: process.env.BILLING_TASKS_SERVICE_ACCOUNT, audience: 'https://dev.example.com' });
    expect(transport.create.mock.calls[1][1].name).toBe(task.name);
    await service.enqueue('CAPTURE', 3, now, 'repair-2026-11-03');
    expect(transport.create.mock.calls[2][1].name).not.toBe(task.name);
  });
  it('keeps enqueue failures recoverable and treats duplicate task creation as success', async () => {
    const { service, transport } = fixture();
    transport.create.mockRejectedValueOnce({ response: { status: 409, data: { error: { status: 'ALREADY_EXISTS' } } } });
    expect(await service.enqueue('MAIL', 108)).toBe(true);
    transport.create.mockRejectedValueOnce(new Error('transport unavailable'));
    expect(await service.enqueue('MAIL', 108)).toBe(false);
  });
  it('does not contact Google until explicitly enabled', async () => {
    const { service, transport } = fixture(); process.env.BILLING_TASKS_ENABLED = 'false';
    service.onModuleInit();
    expect(await service.enqueue('MAIL', 108)).toBe(false);
    expect(await service.verifyAuthorization('Bearer token')).toBe(false);
    expect(transport.create).not.toHaveBeenCalled(); expect(transport.verify).not.toHaveBeenCalled();
  });
  it.each(['BILLING_TASKS_EXPECTED_DATABASE', 'BILLING_TASKS_PROJECT_ID', 'BILLING_TASKS_AUDIENCE', 'BILLING_TASKS_SERVICE_ACCOUNT'])('fails closed for missing %s', field => {
    const { service } = fixture(); delete process.env[field]; expect(() => service.onModuleInit()).toThrow();
  });
  it('rejects database mismatch and insecure/misdirected targets', () => {
    const { service } = fixture(); process.env.BILLING_TASKS_EXPECTED_DATABASE = 'different';
    expect(() => service.onModuleInit()).toThrow(); process.env.BILLING_TASKS_EXPECTED_DATABASE = 'keepintax-dev';
    process.env.BILLING_TASKS_TARGET_URL = 'http://dev.example.com/internal/billing/completion'; expect(() => service.onModuleInit()).toThrow();
    process.env.BILLING_TASKS_TARGET_URL = 'https://dev.example.com/wrong'; expect(() => service.onModuleInit()).toThrow();
  });
  it('requires verified signature, audience, issuer, live token and the exact verified service account', async () => {
    const { service, transport } = fixture();
    expect(await service.verifyAuthorization('Bearer signed-token')).toBe(true);
    expect(transport.verify).toHaveBeenCalledWith('signed-token', 'https://dev.example.com');
    const valid = await transport.verify.mock.results[0].value;
    for (const patch of [{ aud: 'other' }, { iss: 'evil' }, { email: 'other@example.com' }, { email_verified: false }, { sub: '' }, { exp: 1 }]) {
      transport.verify.mockResolvedValueOnce({ ...valid, ...patch });
      expect(await service.verifyAuthorization('Bearer token')).toBe(false);
    }
    transport.verify.mockRejectedValueOnce(new Error('invalid signature'));
    expect(await service.verifyAuthorization('Bearer forged-token')).toBe(false);
    expect(await service.verifyAuthorization()).toBe(false);
  });
  it('ignores spoofed Cloud Tasks headers and validates the task body before work', async () => {
    const tasks = { verifyAuthorization: jest.fn().mockResolvedValue(false) };
    const guard = new BillingTaskGuard(tasks as any);
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-cloudtasks-queuename': 'trusted' } }) }) } as any)).rejects.toThrow();
    const completion = { handle: jest.fn() }; const controller = new BillingTaskController(completion as any);
    for (const body of [null, {}, { kind: 'CHARGE', id: 3 }, { kind: 'MAIL', id: '3' }, { kind: 'MAIL', id: -1 }, { kind: 'MAIL', id: 3, amount: 1 }]) {
      await expect(controller.complete(body)).rejects.toThrow();
    }
    expect(completion.handle).not.toHaveBeenCalled();
    await controller.complete({ kind: 'MAIL', id: 108 }); expect(completion.handle).toHaveBeenCalledWith('MAIL', 108);
  });
});

describe('durable mail commit -> enqueue boundary', () => {
  it('commits its crash schedule before enqueue, retains it if enqueue fails, and notifies failures after commit', async () => {
    let committed = false;
    const event: any = { id: 108, eventType: BillingEventType.RENEWAL_SUCCESS, receiptDocId: 243, receiptEmailSent: false, metadata: {} };
    const manager = { findOne: jest.fn().mockResolvedValue(event), save: jest.fn().mockResolvedValue(event) };
    const repo = { manager: { transaction: async cb => { committed = false; const value = await cb(manager); committed = true; return value; } } };
    const tasks = { enqueue: jest.fn(async () => { expect(committed).toBe(true); return false; }) };
    const service = new BillingEventService(repo as any, tasks as any);
    const lease = await service.claimReceiptEmail(108);
    expect(tasks.enqueue).toHaveBeenCalledWith('MAIL', 108, new Date(event.metadata.receiptEmail.nextAttemptAt));
    expect(event.metadata.receiptEmail.leaseId).toBe(lease);
    await service.finishReceiptEmail(108, lease!, false, 'socket hang up');
    expect(tasks.enqueue).toHaveBeenCalledTimes(2);
    expect(event.receiptEmailSent).toBe(false);
    expect(event.metadata.receiptEmail.nextAttemptAt).toBeTruthy();
    const nextLease = await service.claimReceiptEmail(108, true);
    await service.finishReceiptEmail(108, nextLease!, true);
    expect(event.receiptEmailSent).toBe(true); expect(event.metadata.receiptEmail.nextAttemptAt).toBeNull();
  });
  it('does not enqueue after rollback', async () => {
    const tasks = { enqueue: jest.fn() };
    const service = new BillingEventService({ manager: { transaction: jest.fn().mockRejectedValue(new Error('rollback')) } } as any, tasks as any);
    await expect(service.claimReceiptEmail(108)).rejects.toThrow('rollback'); expect(tasks.enqueue).not.toHaveBeenCalled();
  });
});
