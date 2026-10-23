import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FeezbackController } from './feezback.controller';
import { FeezbackService } from './feezback.service';
import { FeezbackDisconnectionService } from './feezback-disconnection.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { SubscriptionGuard } from '../guards/subscription.guard';
import { DESIGNER_SANDBOX_PROFILE } from '../demo-data/profiles/designer-sandbox.profile';

describe('connection options reconcile current provider permissions', () => {
  let user: any, api: any, users: any, sources: any, sync: any;
  let provider: FeezbackService, disconnection: FeezbackDisconnectionService, controller: FeezbackController;
  const req: any = { user: { firebaseId: 'owner' } };
  beforeEach(() => {
    user = { firebaseId: 'owner', hasOpenBanking: true, hasSpouseFeezbackIdentity: true };
    api = {
      getUserConsents: jest.fn().mockResolvedValue({ consents: [] }),
      getUserAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
      getUserCards: jest.fn().mockResolvedValue({ cards: [] }),
      terminateConsent: jest.fn(),
    };
    users = { findOne: jest.fn().mockResolvedValue(user),
      update: jest.fn(async (_where, patch) => Object.assign(user, patch)) };
    sources = { find: jest.fn().mockResolvedValue([
      { id: 11, userId: 'owner', sourceName: '1234567', sourceType: 'BANK_ACCOUNT', connectionRole: 'primary', bill: { id: 22 } },
    ]) };
    sync = { getSourceResults: jest.fn().mockResolvedValue([]), clearConsentInitiated: jest.fn().mockResolvedValue(undefined) };
    provider = new FeezbackService({} as any, { getTppId: () => 'tpp' } as any, api, {} as any,
      {} as any, sync, users, sources, {} as any, {} as any);
    disconnection = new FeezbackDisconnectionService(api, users, sources, sync);
    controller = new FeezbackController(provider, {} as any, {} as any, {} as any, {} as any, disconnection);
  });
  afterEach(() => { expect(api.terminateConsent).not.toHaveBeenCalled(); });

  it('suppresses the stale spouse choice after complete absence of permissions without any termination', async () => {
    const original = JSON.stringify(await sources.find());
    expect(await controller.connectionOptions(req)).toEqual({ offerSpouse: false });
    expect(user).toMatchObject({ hasOpenBanking: false, hasSpouseFeezbackIdentity: false });
    expect(api.getUserConsents.mock.calls).toEqual([['owner_sub', true], ['owner_sub_spouse', true]]);
    expect(sync.clearConsentInitiated).toHaveBeenCalledWith('owner');
    expect(JSON.stringify(await sources.find())).toBe(original);
  });
  it('treats terminated/revoked permissions as fully disconnected before reading options', async () => {
    api.getUserConsents.mockResolvedValue({ consents: [
      { resourceId: 'old1', consentStatus: 'terminatedByTpp' }, { resourceId: 'old2', consentStatus: 'revokedByPsu' },
    ] });
    expect(await controller.connectionOptions(req)).toEqual({ offerSpouse: false });
    expect(api.getUserAccounts).not.toHaveBeenCalled();
    expect(api.getUserCards).not.toHaveBeenCalled();
  });
  it('preserves flags and retained spouse choice when one identity cannot be verified', async () => {
    api.getUserConsents.mockImplementation(async sub => {
      if (sub.endsWith('_sub_spouse')) throw Error('provider unavailable');
      return { consents: [] };
    });
    expect(await controller.connectionOptions(req)).toEqual({ offerSpouse: true });
    expect(user).toMatchObject({ hasOpenBanking: true, hasSpouseFeezbackIdentity: true });
    expect(users.update).not.toHaveBeenCalled();
    expect(sync.clearConsentInitiated).not.toHaveBeenCalled();
  });
  it.each(['received', 'suspendedByASPSP', 'futureStatus'])('preserves historical spouse choice with remaining %s permission', async consentStatus => {
    api.getUserConsents.mockResolvedValue({ consents: [{ resourceId: 'remaining', consentStatus }] });
    expect(await controller.connectionOptions(req)).toEqual({ offerSpouse: true });
    expect(user.hasSpouseFeezbackIdentity).toBe(true);
    expect(sync.clearConsentInitiated).not.toHaveBeenCalled();
  });
  it('continues offering spouse enrollment for a provider-verified current connection', async () => {
    user.hasSpouseFeezbackIdentity = false;
    api.getUserConsents.mockResolvedValue({ consents: [{ resourceId: 'current', consentStatus: 'valid' }] });
    api.getUserAccounts.mockResolvedValue({ accounts: [{ resourceId: 'a1', consentId: 'current' }] });
    expect(await controller.connectionOptions(req)).toEqual({ offerSpouse: true });
    expect(user.hasOpenBanking).toBe(true);
    expect(sync.clearConsentInitiated).not.toHaveBeenCalled();
  });
  it('preserves the synthetic demo exception without contacting the provider or resetting flags', async () => {
    user.email = DESIGNER_SANDBOX_PROFILE.email;
    expect(await controller.connectionOptions(req)).toEqual({ offerSpouse: true });
    expect(api.getUserConsents).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(sync.clearConsentInitiated).not.toHaveBeenCalled();
  });
  it.each([new BadRequestException('unrelated validation error'), Error('database unavailable')])('does not hide unrelated reconciliation errors', async error => {
    jest.spyOn(disconnection, 'targets').mockRejectedValue(error);
    const options = jest.spyOn(provider, 'getConnectionOptions');
    await expect(controller.connectionOptions(req)).rejects.toBe(error);
    expect(options).not.toHaveBeenCalled();
  });
  it('keeps both existing authentication and subscription guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, FeezbackController.prototype.connectionOptions)).toEqual([FirebaseAuthGuard, SubscriptionGuard]);
  });
});
