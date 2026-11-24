import {
  FeezbackLifecycleService,
  enqueueLifecycle,
} from './feezback-lifecycle.service';
import { FeezbackLifecycle } from './feezback-lifecycle.entity';
import { emptyEvidence } from './feezback-lifecycle.policy';
import { UserSourceSyncState } from '../../transactions/user-source-sync-state.entity';

describe('Feezback lifecycle durable work', () => {
  let service: FeezbackLifecycleService,
    db: any,
    api: any,
    disconnect: any,
    repo: any,
    job: FeezbackLifecycle;
  const entitlement = {
    eligible: false,
    reason: 'NO_ENTITLEMENT',
    until: null,
    plan: 'basic',
    subscriptionStatus: 'ACTIVE',
  };
  beforeEach(() => {
    process.env.FEEZBACK_LIFECYCLE_ENABLED = 'true';
    delete process.env.FEEZBACK_LIFECYCLE_AUTODISCONNECT;
    job = {
      firebaseId: 'owner',
      generation: 4,
      attempts: 0,
      disconnectRequested: false,
      evidence: null,
    } as any;
    const qb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    repo = {
      createQueryBuilder: () => qb,
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    db = {
      getRepository: () => repo,
      manager: {
        findOne: jest.fn().mockResolvedValue({
          firebaseId: 'owner',
          email: 'real@example.com',
        }),
        query: jest.fn(),
      },
    };
    db.transaction = jest.fn(async (callback) =>
      callback({
        findOne: jest.fn().mockImplementation(async (entity: any) =>
          entity === FeezbackLifecycle
            ? {
                ...job,
                leaseToken:
                  repo.createQueryBuilder().set.mock.calls[0][0].leaseToken,
              }
            : {},
        ),
      }),
    );
    api = {
      getUserConsents: jest.fn().mockResolvedValue({
        consents: [{ resourceId: 'bank', consentStatus: 'valid' }],
      }),
    };
    disconnect = {
      perform: jest.fn().mockResolvedValue({ status: 'success' }),
      disconnect: jest.fn(async (_id, _request, guard) =>
        guard ? guard(disconnect.perform) : disconnect.perform(),
      ),
    };
    service = new FeezbackLifecycleService(
      db,
      api,
      disconnect,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'entitlement').mockResolvedValue(entitlement as any);
  });
  afterEach(() => {
    delete process.env.FEEZBACK_LIFECYCLE_ENABLED;
    delete process.env.FEEZBACK_LIFECYCLE_AUTODISCONNECT;
  });
  const saved = () => repo.update.mock.calls[0][1];
  it('observe-only reads both identities with invalid consents and never terminates', async () => {
    await service.run(job);
    expect(api.getUserConsents.mock.calls).toEqual([
      ['owner_sub', true],
      ['owner_sub_spouse', true],
    ]);
    expect(disconnect.perform).not.toHaveBeenCalled();
    expect(saved().lastAction).toBe('OBSERVED');
  });
  it('failed reads preserve successful evidence and schedule bounded retry', async () => {
    job.evidence = emptyEvidence();
    job.evidence.primary = {
      checkedAt: '2026-11-01T00:00:00Z',
      error: null,
      consents: [{ id: 'old', status: 'valid', validUntil: null }],
    };
    api.getUserConsents.mockRejectedValue(new Error('secret provider body'));
    await service.run(job);
    expect(saved().evidence.primary.consents[0].id).toBe('old');
    expect(saved().evidence.primary.checkedAt).toBe('2026-11-01T00:00:00Z');
    expect(saved().evidence.primary.error).toBe('CONSENT_CHECK_FAILED');
    expect(saved().attempts).toBe(1);
    expect(JSON.stringify(saved())).not.toContain('secret provider');
    expect(saved().nextCheckAt.getTime() - Date.now()).toBeLessThanOrEqual(
      60_000,
    );
  });
  it('malformed successful provider responses remain unknown', async () => {
    api.getUserConsents.mockResolvedValue({
      consents: [{ consentStatus: 'valid' }],
    });
    await service.run(job);
    expect(saved().evidence.primary.checkedAt).toBeNull();
    expect(saved().lastError).toBe('CONSENT_CHECK_FAILED');
  });
  it('a competing replica cannot run an already claimed job', async () => {
    repo.createQueryBuilder().execute.mockResolvedValue({ affected: 0 });
    await service.run(job);
    expect(api.getUserConsents).not.toHaveBeenCalled();
  });
  it('rechecks entitlement and skips automatic termination after a renewal', async () => {
    process.env.FEEZBACK_LIFECYCLE_AUTODISCONNECT = 'true';
    (service.entitlement as jest.Mock)
      .mockResolvedValueOnce(entitlement)
      .mockResolvedValueOnce({ ...entitlement, eligible: true });
    await service.run(job);
    expect(disconnect.perform).not.toHaveBeenCalled();
  });
  it('a newer manual request or webhook queued during observation supersedes the claimed job', async () => {
    process.env.FEEZBACK_LIFECYCLE_AUTODISCONNECT = 'true';
    db.transaction.mockImplementation(async (callback) =>
      callback({
        findOne: jest
          .fn()
          .mockResolvedValue({ generation: job.generation + 1 }),
      }),
    );
    await service.run(job);
    expect(disconnect.perform).not.toHaveBeenCalled();
  });
  it('saved-state admin listing never contacts the provider', async () => {
    repo.findAndCount = jest
      .fn()
      .mockResolvedValue([
        [{ firebaseId: 'owner', fName: 'A', email: 'real@example.com' }],
        1,
      ]);
    db.manager.find = jest.fn().mockResolvedValue([]);
    const result = await service.list();
    expect(result.total).toBe(1);
    expect(result.rows[0].expectedUnits).toBeNull();
    expect(api.getUserConsents).not.toHaveBeenCalled();
    expect(disconnect.perform).not.toHaveBeenCalled();
  });
  it('marks fixture provenance for display without suppressing real provider evidence or changing synthetic policy', async () => {
    repo.findAndCount = jest
      .fn()
      .mockResolvedValue([
        [{ firebaseId: 'owner', fName: 'Lab', email: 'lab@example.com' }],
        1,
      ]);
    const evidence = emptyEvidence();
    evidence.primary = {
      checkedAt: new Date().toISOString(),
      error: null,
      consents: [{ id: 'real-consent', status: 'valid', validUntil: null }],
    };
    evidence.spouse.checkedAt = new Date().toISOString();
    db.manager.find = jest.fn(async (entity) =>
      entity === UserSourceSyncState
        ? [
            {
              userId: 'owner',
              consentId: 'expense-document-lab-consent',
              resourceId: 'expense-document-lab-bank',
              consentVerifiedAt: null,
            },
          ]
        : entity === FeezbackLifecycle
        ? [{ firebaseId: 'owner', evidence, nextCheckAt: new Date() }]
        : [],
    );
    const result = await service.list();
    expect(result.rows[0]).toMatchObject({
      localDataIsDemo: true,
      synthetic: false,
      expectedUnits: 1,
    });
    expect(api.getUserConsents).not.toHaveBeenCalled();
    expect(disconnect.perform).not.toHaveBeenCalled();
  });
  it('automatically disconnects all identities and verifies both again', async () => {
    process.env.FEEZBACK_LIFECYCLE_AUTODISCONNECT = 'true';
    api.getUserConsents
      .mockResolvedValueOnce({
        consents: [{ resourceId: 'bank', consentStatus: 'valid' }],
      })
      .mockResolvedValueOnce({
        consents: [{ resourceId: 'spouse', consentStatus: 'valid' }],
      })
      .mockResolvedValue({ consents: [] });
    await service.run(job);
    expect(disconnect.disconnect).toHaveBeenCalledWith(
      'owner',
      { scope: 'all' },
      expect.any(Function),
    );
    expect(saved()).toMatchObject({
      lastAction: 'DISCONNECTED',
      lastError: null,
      disconnectRequested: false,
    });
    expect(api.getUserConsents).toHaveBeenCalledTimes(4);
  });
  it('a remaining permission keeps manual disconnect pending even after HTTP success', async () => {
    job.disconnectRequested = true;
    await service.run(job);
    expect(saved()).toMatchObject({
      lastAction: 'DISCONNECT_PENDING',
      lastError: 'DISCONNECTION_NOT_VERIFIED',
      disconnectRequested: true,
    });
  });
  it('newer queued work cannot be overwritten by an old completion', async () => {
    await service.run(job);
    expect(repo.update.mock.calls[0][0]).toMatchObject({
      firebaseId: 'owner',
      generation: 4,
      leaseToken: expect.any(String),
    });
    expect(repo.update.mock.calls[1][1]).toEqual({
      leaseToken: null,
      leaseUntil: null,
    });
  });
  it('disabled enqueue does not require the new schema or touch billing', async () => {
    delete process.env.FEEZBACK_LIFECYCLE_ENABLED;
    await enqueueLifecycle(db.manager, 'owner');
    expect(db.manager.query).not.toHaveBeenCalled();
  });
  it('enqueue uses the supplied transaction and preserves pending manual work', async () => {
    await enqueueLifecycle(db.manager, 'owner', true, 'admin');
    expect(db.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('generation=generation+1'),
      ['owner', 1, 'admin', expect.any(Date)],
    );
  });
});
