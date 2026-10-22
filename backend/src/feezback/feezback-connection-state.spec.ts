import { FeezbackService } from './feezback.service';

describe('Feezback persisted connection state', () => {
  let api: any, users: any, enrollment: any, service: FeezbackService, user: any;
  beforeEach(() => {
    user = { firebaseId: 'owner', hasOpenBanking: false };
    api = { getUserAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
      getUserCards: jest.fn().mockResolvedValue({ cards: [] }),
      getUserConsents: jest.fn().mockResolvedValue({ consents: [{ resourceId: 'c1', consentStatus: 'valid' }] }) };
    users = { findOne: jest.fn().mockResolvedValue(user), update: jest.fn(async (_where, patch) => Object.assign(user, patch)) };
    enrollment = { connectionVerified: jest.fn().mockResolvedValue(undefined) };
    service = new FeezbackService({} as any, { getTppId: () => 'tpp' } as any, api, {} as any, {} as any,
      { markSourcesRefreshed: jest.fn().mockResolvedValue(undefined) } as any, users, {} as any,
      { autoUpgradeReferralOpenBankingIfEligible: jest.fn().mockResolvedValue(undefined) } as any,
      { sendMail: jest.fn().mockResolvedValue(undefined) } as any, enrollment);
    (service as any).upsertSources = jest.fn().mockResolvedValue(undefined);
    (service as any).prePopulateSourceResults = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  it('does not connect or arm billing on successful but empty responses', async () => {
    await service.refreshUserSources('owner', 'test'); expect(user.hasOpenBanking).toBe(false);
    expect(enrollment.connectionVerified).not.toHaveBeenCalled();
  });
  it('persists and arms only a source linked to a valid consent', async () => {
    api.getUserAccounts.mockResolvedValue({ accounts: [{ iban: 'IL1234567', resourceId: 'bank1', consentId: 'c1' }] });
    await service.refreshUserSources('owner', 'test'); expect(user.hasOpenBanking).toBe(true);
    expect(enrollment.connectionVerified).toHaveBeenCalledWith('owner');
  });
  it('clears a connection when complete reads prove the last consent invalid', async () => {
    user.hasOpenBanking = true;
    api.getUserConsents.mockResolvedValue({ consents: [{ resourceId: 'c1', consentStatus: 'revoked' }] });
    api.getUserAccounts.mockResolvedValue({ accounts: [{ iban: 'IL1234567', resourceId: 'bank1', consentId: 'c1' }] });
    await service.refreshUserSources('owner', 'test'); expect(user.hasOpenBanking).toBe(false);
    expect(enrollment.connectionVerified).not.toHaveBeenCalled();
  });
  it('preserves connection on a partial provider failure with no positive proof', async () => {
    user.hasOpenBanking = true; api.getUserCards.mockRejectedValue(Error('unavailable'));
    await service.refreshUserSources('owner', 'test'); expect(user.hasOpenBanking).toBe(true);
    expect(users.update).not.toHaveBeenCalled();
  });
  it('preserves connection if consent verification fails', async () => {
    user.hasOpenBanking = true; api.getUserConsents.mockRejectedValue(Error('unavailable'));
    await expect(service.refreshUserSources('owner', 'test')).rejects.toThrow('unavailable');
    expect(user.hasOpenBanking).toBe(true); expect(enrollment.connectionVerified).not.toHaveBeenCalled();
  });
  it('late data-ready webhook cannot restore a terminated consent from stale provider sources', async () => {
    user.hasOpenBanking = false;
    api.getUserConsents.mockResolvedValue({ consents: [{ resourceId: 'c1', consentStatus: 'terminatedByTpp' }] });
    api.getUserAccounts.mockResolvedValue({ accounts: [{ iban: 'IL1234567', resourceId: 'bank1', consentId: 'c1' }] });
    await service.refreshUserSources('owner', 'UserDataIsAvailable');
    expect((service as any).prePopulateSourceResults).toHaveBeenCalledWith('owner', [], []);
    expect(user.hasOpenBanking).toBe(false);
    expect(enrollment.connectionVerified).not.toHaveBeenCalled();
  });

  it('late shared-consent discovery keeps bank and card retry pointers on the remaining valid permission', async () => {
    const bank = { iban: 'IL1234567', resourceId: 'bank1', consentId: 'c1',
      relatedConsents: [{ resourceId: 'pending' }, { resourceId: 'c2' }] };
    const card = { maskedPan: '1234', resourceId: 'card1', consentId: 'c1',
      relatedConsents: [{ resourceId: 'expired' }, { resourceId: 'c2' }] };
    api.getUserConsents.mockResolvedValue({ consents: [
      { resourceId: 'c1', consentStatus: 'terminatedByTpp' },
      { resourceId: 'pending', consentStatus: 'received' },
      { resourceId: 'expired', consentStatus: 'valid', validUntil: '2000-01-01' },
      { resourceId: 'c2', consentStatus: 'valid' },
    ] });
    api.getUserAccounts.mockResolvedValue({ accounts: [bank] });
    api.getUserCards.mockResolvedValue({ cards: [card] });
    await service.refreshUserSources('owner', 'UserDataIsAvailable');
    expect((service as any).prePopulateSourceResults).toHaveBeenCalledWith('owner',
      [expect.objectContaining({ resourceId: 'bank1', consentId: 'c2' })],
      [expect.objectContaining({ resourceId: 'card1', consentId: 'c2' })]);
    expect(user.hasOpenBanking).toBe(true);
    expect(bank.consentId).toBe('c1'); expect(card.consentId).toBe('c1');
  });

});
