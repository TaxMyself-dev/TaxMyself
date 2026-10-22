import { DESIGNER_SANDBOX_PROFILE } from '../demo-data/profiles/designer-sandbox.profile';
import { FeezbackDisconnectionService } from './feezback-disconnection.service';
import { FeezbackController } from './feezback.controller';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FeezbackHttpError } from './core/feezback-errors';

describe('Feezback disconnection', () => {
  let api: any, users: any, sources: any, sync: any, service: FeezbackDisconnectionService, user: any;
  let permissions: Record<string, any[]>;
  beforeEach(() => {
    user = { firebaseId: 'owner', hasOpenBanking: true, hasSpouseFeezbackIdentity: true };
    permissions = { owner_sub: [{ resourceId: 'c1', consentStatus: 'valid' }],
      owner_sub_spouse: [{ resourceId: 'c2', consentStatus: 'received' }] };
    api = {
      getUserConsents: jest.fn(async sub => ({ consents: permissions[sub] })),
      getUserAccounts: jest.fn(async sub => ({ accounts: [{ resourceId: 'a1', consentId: permissions[sub]?.[0]?.resourceId }] })),
      getUserCards: jest.fn().mockResolvedValue({ cards: [] }),
      terminateConsent: jest.fn(async (sub, id) => { permissions[sub] = permissions[sub].map(c => c.resourceId === id ? { ...c, consentStatus: 'terminatedByTpp' } : c); }),
    };
    users = { findOne: jest.fn().mockResolvedValue(user), update: jest.fn(async (_where, patch) => Object.assign(user, patch)) };
    sources = { find: jest.fn().mockResolvedValue([
      { id: 11, userId: 'owner', connectionRole: 'primary', sourceName: '1234567', sourceType: 'BANK_ACCOUNT', bill: { id: 99 } },
    ]) };
    sync = { getSourceResults: jest.fn().mockResolvedValue([
      { sourceRecordId: 11, sourceId: '1234567', resourceId: 'a1', consentId: 'c1', connectionRole: 'primary' },
    ]), clearConsentInitiated: jest.fn().mockResolvedValue(undefined), upsertSourceConsents: jest.fn().mockResolvedValue(undefined), clearConsentOnSources: jest.fn().mockResolvedValue(1) };
    service = new FeezbackDisconnectionService(api, users, sources, sync);
  });
  it('protects synthetic demo connections before provider or source access', async () => {
    user.email = DESIGNER_SANDBOX_PROFILE.email;
    await expect(service.targets('owner')).rejects.toMatchObject({ response: { code: 'SYNTHETIC_OPEN_BANKING' } });
    await expect(service.disconnect('owner', { scope: 'all' })).rejects.toMatchObject({ response: { code: 'SYNTHETIC_OPEN_BANKING' } });
    expect(api.getUserConsents).not.toHaveBeenCalled();
    expect(api.terminateConsent).not.toHaveBeenCalled();
    expect(sources.find).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(user.hasOpenBanking).toBe(true);
  });
  it('lists pending and unknown permissions and covers spouse, with preserved source IDs', async () => {
    permissions.owner_sub_spouse.push({ resourceId: 'c3', consentStatus: 'futureStatus' });
    const preview = await service.targets('owner');
    expect(preview.consents).toHaveLength(3);
    expect(preview.consents[0].sources).toEqual([{ sourceRecordId: 11, sourceName: '1234567', sourceType: 'BANK_ACCOUNT' }]);
    expect(api.getUserConsents).toHaveBeenCalledWith('owner_sub_spouse', true);
  });
  it('previews every provider-linked instrument, including ones absent from permanent sources', async () => {
    api.getUserAccounts.mockResolvedValue({ accounts: [
      { resourceId: 'a1', consentId: 'c1', iban: 'IL000001234567' },
      { resourceId: 'a2', relatedConsents: [{ resourceId: 'c1' }], iban: 'IL000007654321', currency: 'USD' },
    ] });
    api.getUserCards.mockResolvedValue({ cards: [
      { resourceId: 'card1', consentId: 'c1', maskedPan: '************9876' },
      { resourceId: 'card2', consentId: 'c1' },
    ] });
    const preview = await service.targets('owner');
    expect(preview.consents[0].sources).toEqual([
      { sourceRecordId: 11, sourceName: '1234567', sourceType: 'BANK_ACCOUNT' },
      { sourceRecordId: null, resourceId: 'a2', sourceName: '•••7654321 USD', sourceType: 'BANK_ACCOUNT' },
      { sourceRecordId: null, resourceId: 'card1', sourceName: '•••9876', sourceType: 'CREDIT_CARD' },
      { sourceRecordId: null, resourceId: 'card2', sourceName: 'אמצעי תשלום נוסף', sourceType: 'CREDIT_CARD' },
    ]);
    expect(JSON.stringify(preview.consents[0].sources)).not.toContain('IL00000');
    expect(api.terminateConsent).not.toHaveBeenCalled();
    expect(sync.upsertSourceConsents).not.toHaveBeenCalled();
  });
  it('terminates every identity, verifies state and changes no retained source data', async () => {
    const snapshot = JSON.stringify(await sources.find());
    const result = await service.disconnect('owner', { scope: 'all' });
    expect(result).toMatchObject({ status: 'success', hasOpenBanking: false, remainingConsents: [] });
    expect(api.terminateConsent.mock.calls).toEqual([['owner_sub', 'c1'], ['owner_sub_spouse', 'c2']]);
    expect(sync.clearConsentOnSources).toHaveBeenCalledWith('owner', 'c1', false);
    // Spouse has no persisted source metadata in this fixture.
    expect(sync.clearConsentOnSources).not.toHaveBeenCalledWith('owner', 'c2', true);
    expect(JSON.stringify(await sources.find())).toBe(snapshot);
    expect(user.hasSpouseFeezbackIdentity).toBe(true);
    expect(sync.clearConsentInitiated).toHaveBeenCalledWith('owner');
  });
  it('single cancellation leaves another valid identity connected', async () => {
    permissions.owner_sub_spouse[0].consentStatus = 'valid';
    const result = await service.disconnect('owner', { scope: 'consent', consentId: 'c1', connectionRole: 'primary' });
    expect(result).toMatchObject({ status: 'success', hasOpenBanking: true });
    expect(result.remainingConsents).toHaveLength(1);
    expect(sync.clearConsentInitiated).not.toHaveBeenCalled();
    expect(api.terminateConsent).toHaveBeenCalledTimes(1);
  });
  it('refuses a consent belonging to another owner/identity before DELETE', async () => {
    await expect(service.disconnect('owner', { scope: 'consent', consentId: 'foreign', connectionRole: 'primary' })).rejects.toThrow('owned');
    expect(api.terminateConsent).not.toHaveBeenCalled();
  });
  it('reports partial failure and leaves an active connection on a remaining permission', async () => {
    permissions.owner_sub_spouse[0].consentStatus = 'valid';
    api.terminateConsent.mockImplementation(async (sub, id) => {
      if (sub.endsWith('spouse')) throw Error('provider');
      permissions[sub] = [];
    });
    const result = await service.disconnect('owner', { scope: 'all' });
    expect(result).toMatchObject({ status: 'partial', hasOpenBanking: true });
    expect(result.results.map(r => r.status)).toEqual(['terminated', 'failed']);
  });
  it('does not declare async acceptance complete while consent is still present', async () => {
    api.terminateConsent.mockResolvedValue(undefined);
    const result = await service.disconnect('owner', { scope: 'all' });
    expect(result.status).toBe('partial');
    expect(result.results.every(r => r.status === 'pending')).toBe(true);
    expect(sync.clearConsentInitiated).not.toHaveBeenCalled();
    expect(sync.clearConsentOnSources).not.toHaveBeenCalled();
  });
  it('preserves flag and reports uncertainty if final consent verification fails', async () => {
    api.terminateConsent.mockImplementation(async () => { api.getUserConsents.mockRejectedValue(Error('offline')); });
    const result = await service.disconnect('owner', { scope: 'all' });
    expect(result).toMatchObject({ status: 'partial', complete: false, hasOpenBanking: true });
    expect(sync.clearConsentOnSources).not.toHaveBeenCalled();
  });
  it('fails closed on malformed consent metadata and does not erase prior connection', async () => {
    api.getUserConsents.mockResolvedValue({ consents: [{ consentStatus: 'valid' }] });
    const result = await service.disconnect('owner', { scope: 'all' });
    expect(result.status).toBe('partial'); expect(user.hasOpenBanking).toBe(true);
    expect(api.terminateConsent).not.toHaveBeenCalled();
  });
  it.each([123, {}, '   '])('rejects malformed consent ID %p without DELETE', async resourceId => {
    api.getUserConsents.mockResolvedValue({ consents: [{ resourceId, consentStatus: 'valid' }] });
    expect((await service.disconnect('owner', { scope: 'all' })).status).toBe('partial');
    expect(api.terminateConsent).not.toHaveBeenCalled();
  });
  it('retries full disconnect idempotently without retained-data writes', async () => {
    await service.disconnect('owner', { scope: 'all' });
    api.terminateConsent.mockClear();
    expect((await service.disconnect('owner', { scope: 'all' })).status).toBe('success');
    expect(api.terminateConsent).not.toHaveBeenCalled();
  });
  it('queries pending spouse onboarding even without historical flag or spouse sources', async () => {
    user.hasSpouseFeezbackIdentity = false;
    await service.disconnect('owner', { scope: 'all' });
    expect(api.terminateConsent).toHaveBeenCalledWith('owner_sub_spouse', 'c2');
  });
  it('accepts an absent provider identity normalized to an empty consent list', async () => {
    api.getUserConsents.mockImplementation(async sub => {
      if (sub.endsWith('spouse')) return { consents: [] };
      return { consents: permissions[sub] };
    });
    expect((await service.disconnect('owner', { scope: 'all' })).status).toBe('success');
  });
  it('never interprets an unattributed provider 404 as proof of disconnection', async () => {
    api.getUserConsents.mockRejectedValue({ status: 404 });
    expect((await service.disconnect('owner', { scope: 'all' })).status).toBe('partial');
    expect(user.hasOpenBanking).toBe(true);
  });
  it.each([
    ['POST', 'https://proxy.test/proxy/feezback/token', 'authentication', 401],
    ['GET', 'https://proxy.test/proxy/feezback/tpp/v1/users/private-id/consents', 'provider', 503],
  ])('reports safe %s read diagnostics without exposing provider data', async (method, url, stage, httpStatus) => {
    api.getUserConsents.mockImplementation(async sub => {
      if (sub.endsWith('spouse')) throw new FeezbackHttpError({ method, url, status: httpStatus,
        message: 'secret-message', responseBody: { token: 'secret-token', account: 'private-account' } });
      return { consents: [] };
    });
    const result = await service.targets('owner');
    expect(result).toMatchObject({ complete: false, hasOpenBanking: true });
    expect(result.errors).toEqual([{ connectionRole: 'spouse', code: 'consents_unavailable', operation: 'consents', stage, httpStatus }]);
    expect(JSON.stringify(result.errors)).not.toMatch(/secret|private|https/);
    expect(users.update).not.toHaveBeenCalled();
    expect(api.terminateConsent).not.toHaveBeenCalled();
  });
  it('identifies malformed and failed source reads without treating the preview as complete', async () => {
    api.getUserAccounts.mockResolvedValue({ accounts: [{}] });
    api.getUserCards.mockRejectedValue(new FeezbackHttpError({ method: 'GET', url: 'https://proxy.test/cards', status: 403, message: 'secret' }));
    const result = await service.targets('owner');
    expect(result.complete).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      { connectionRole: 'primary', code: 'accounts_unavailable', operation: 'accounts', stage: 'response' },
      { connectionRole: 'primary', code: 'cards_unavailable', operation: 'cards', stage: 'provider', httpStatus: 403 },
    ]));
    expect(users.update).not.toHaveBeenCalled();
  });
  it('clears stale consent pointers on already-terminal no-op disconnect', async () => {
    permissions.owner_sub = [{ resourceId: 'c1', consentStatus: 'terminatedByTpp' }];
    permissions.owner_sub_spouse = [];
    expect((await service.disconnect('owner', { scope: 'all' })).status).toBe('success');
    expect(sync.clearConsentOnSources).toHaveBeenCalledWith('owner', 'c1', false);
    expect(api.terminateConsent).not.toHaveBeenCalled();
  });
  it('rebinds a shared source to remaining valid permission before clearing old pointer', async () => {
    permissions.owner_sub.push({ resourceId: 'shared', consentStatus: 'valid' });
    api.getUserAccounts.mockResolvedValue({ accounts: [{ resourceId: 'a1', consentId: 'shared', relatedConsents: [{ resourceId: 'c1' }] }] });
    sync.getSourceResults.mockResolvedValue([{ sourceRecordId: 11, sourceId: '1234567', type: 'bank', resourceId: 'a1', consentId: 'c1', connectionRole: 'primary' }]);
    await service.disconnect('owner', { scope: 'consent', consentId: 'c1', connectionRole: 'primary' });
    expect(sync.upsertSourceConsents).toHaveBeenCalledWith('owner', [expect.objectContaining({ sourceRecordId: 11, consentId: 'shared' })]);
    expect(sync.upsertSourceConsents.mock.invocationCallOrder[0]).toBeLessThan(sync.clearConsentOnSources.mock.invocationCallOrder[0]);
  });
  it('prefers valid unexpired shared consent over pending, suspended or expired candidates', async () => {
    permissions.owner_sub.push({ resourceId: 'pending', consentStatus: 'received' },
      { resourceId: 'suspended', consentStatus: 'suspendedByASPSP' },
      { resourceId: 'old', consentStatus: 'valid', validUntil: '2000-01-01' },
      { resourceId: 'replacement', consentStatus: 'valid' });
    api.getUserAccounts.mockResolvedValue({ accounts: [{ resourceId: 'a1', relatedConsents:
      ['c1', 'pending', 'suspended', 'old', 'replacement'].map(resourceId => ({ resourceId })) }] });
    sync.getSourceResults.mockResolvedValue([{ sourceRecordId: 11, sourceId: '1234567', type: 'bank', resourceId: 'a1', consentId: 'c1', connectionRole: 'primary' }]);
    await service.disconnect('owner', { scope: 'consent', consentId: 'c1', connectionRole: 'primary' });
    expect(sync.upsertSourceConsents).toHaveBeenCalledWith('owner', [expect.objectContaining({ consentId: 'replacement' })]);
  });
  it('does not rebind to a valid consent whose actual provider source is invalid', async () => {
    permissions.owner_sub.push({ resourceId: 'replacement', consentStatus: 'valid' });
    api.getUserAccounts.mockResolvedValue({ accounts: [{ resourceId: 'a1', consentStatus: 'revokedByPsu',
      relatedConsents: [{ resourceId: 'c1' }, { resourceId: 'replacement' }] }] });
    sync.getSourceResults.mockResolvedValue([{ sourceRecordId: 11, sourceId: '1234567', type: 'bank', resourceId: 'a1', consentId: 'c1', connectionRole: 'primary' }]);
    await service.disconnect('owner', { scope: 'consent', consentId: 'c1', connectionRole: 'primary' });
    expect(sync.upsertSourceConsents).not.toHaveBeenCalled();
    expect(sync.clearConsentOnSources).toHaveBeenCalledWith('owner', 'c1', false);
  });
  it('retains spouse discovery through permanent sources even if historical flag is absent', async () => {
    user.hasSpouseFeezbackIdentity = false;
    sources.find.mockResolvedValue([{ id: 12, connectionRole: 'spouse' }]);
    await service.disconnect('owner', { scope: 'all' });
    expect(api.terminateConsent).toHaveBeenCalledWith('owner_sub_spouse', 'c2');
  });
});

describe('Feezback disconnect actor authorization', () => {
  let controller: FeezbackController, users: any, disconnect: any;
  beforeEach(() => {
    users = { isAdmin: jest.fn().mockResolvedValue(false) };
    disconnect = { targets: jest.fn().mockResolvedValue({ consents: [] }), disconnect: jest.fn().mockResolvedValue({ status: 'success' }) };
    controller = new FeezbackController({} as any, users, {} as any, {} as any, undefined, disconnect);
  });
  it('allows owner even without subscription metadata and uses Firebase guard only', async () => {
    await controller.disconnect({ user: { firebaseId: 'owner', actorFirebaseId: 'owner' } } as any, { scope: 'all' });
    expect(disconnect.disconnect).toHaveBeenCalledWith('owner', { scope: 'all' });
    expect(Reflect.getMetadata(GUARDS_METADATA, FeezbackController.prototype.disconnect)).toEqual([FirebaseAuthGuard]);
  });
  it('verifies the real administrator actor when targeting a customer', async () => {
    users.isAdmin.mockResolvedValue(true);
    await controller.disconnectionTargets({ user: { firebaseId: 'admin', actorFirebaseId: 'admin' } } as any, 'customer');
    expect(users.isAdmin).toHaveBeenCalledWith('admin');
    expect(disconnect.targets).toHaveBeenCalledWith('customer');
  });
  it('rejects accountant delegation and forged admin flags without trusting subject role', async () => {
    await expect(controller.disconnect({ user: { firebaseId: 'customer', actorFirebaseId: 'accountant' }, isAdminImpersonation: true, isDelegatedAccess: true } as any, { scope: 'all' })).rejects.toThrow('owner or an administrator');
    expect(users.isAdmin).toHaveBeenCalledWith('accountant');
    expect(disconnect.disconnect).not.toHaveBeenCalled();
  });
  it('does not allow owner to choose another customer', async () => {
    await expect(controller.disconnectionTargets({ user: { firebaseId: 'owner', actorFirebaseId: 'owner' } } as any, 'other')).rejects.toThrow();
    expect(disconnect.targets).not.toHaveBeenCalled();
  });
});
