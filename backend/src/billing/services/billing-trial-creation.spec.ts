import { UsersService } from '../../users/users.service';
import { BillingService } from './billing.service';
import { SubscriptionStatus } from '../enums/billing.enums';

describe('Trial creation transaction isolation', () => {
  let service: BillingService, repo: any, state: jest.Mock;
  const saved = { id: 7, firebaseId: 'new-user', status: SubscriptionStatus.TRIAL, planId: null };
  const originalTrialDays = process.env.TRIAL_DAYS;
  afterEach(() => {
    if (originalTrialDays === undefined) delete process.env.TRIAL_DAYS;
    else process.env.TRIAL_DAYS = originalTrialDays;
  });
  beforeEach(() => {
    process.env.TRIAL_DAYS = '14';
    service = Object.create(BillingService.prototype);
    repo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(x => x), save: jest.fn().mockResolvedValue(saved) };
    state = jest.fn().mockResolvedValue({ modulesAccess: ['EXPENSES'] });
    Object.assign(service, { subscriptionRepo: repo, logger: { log: jest.fn() }, buildBillingStateResponse: state });
  });
  it('creates through the provided transaction without reading billing presentation state', async () => {
    const manager = { getRepository: jest.fn().mockReturnValue(repo) };
    await expect(service.ensureTrialSubscriptionRecord('new-user', manager as any)).resolves.toBe(saved);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ firebaseId: 'new-user', status: SubscriptionStatus.TRIAL }));
    expect(state).not.toHaveBeenCalled();
  });
  it('preserves an existing subscription without reinitializing its trial', async () => {
    repo.findOne.mockResolvedValue(saved);
    await expect(service.ensureTrialSubscriptionRecord('new-user')).resolves.toBe(saved);
    expect(repo.save).not.toHaveBeenCalled();
    expect(state).not.toHaveBeenCalled();
  });
  it('returns the winning subscription after a concurrent duplicate insert', async () => {
    repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(saved);
    repo.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    await expect(service.ensureTrialSubscriptionRecord('new-user')).resolves.toBe(saved);
    expect(state).not.toHaveBeenCalled();
  });
  it('keeps the full response for the public billing trial endpoint', async () => {
    await expect(service.ensureTrialSubscription('new-user')).resolves.toEqual({ modulesAccess: ['EXPENSES'] });
    expect(state).toHaveBeenCalledWith(saved, null, 'new-user');
  });
});

describe('User trial provisioning', () => {
  it('uses persistence only and forwards the signup transaction', async () => {
    const manager = {} as any;
    const billingService = { ensureTrialSubscriptionRecord: jest.fn().mockResolvedValue({ id: 7 }) };
    await expect(UsersService.prototype.ensureTrialSubscription.call({ billingService }, 'new-user', manager)).resolves.toBeUndefined();
    expect(billingService.ensureTrialSubscriptionRecord).toHaveBeenCalledWith('new-user', manager);
  });
});
