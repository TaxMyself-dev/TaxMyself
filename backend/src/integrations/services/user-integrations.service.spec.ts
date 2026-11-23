// A valid 32-byte base64 key so encryptIntegrationToken works in tests.
process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';
import { UserIntegrationsService } from './user-integrations.service';

describe('UserIntegrationsService — multi-account upsert', () => {
  let service: UserIntegrationsService;
  let repo: jest.Mocked<Repository<UserIntegration>>;
  let query: any;

  const baseInput = {
    firebaseId: 'user-1',
    provider: IntegrationProvider.GOOGLE,
    accountId: 'google-sub-1',
    connectedAccountId: 'ca-test',
    accountEmail: 'a@example.com',
    scopes: 'openid https://www.googleapis.com/auth/gmail.readonly',
    expiresAt: null,
  };

  beforeEach(async () => {
    query = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({ affected: 1 }) };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((entity) => entity as UserIntegration),
      save: jest.fn((entity) => Promise.resolve({ id: 42, ...entity } as UserIntegration)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<UserIntegration>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserIntegrationsService,
        { provide: getRepositoryToken(UserIntegration), useValue: repo },
      ],
    }).compile();

    service = module.get(UserIntegrationsService);
  });

  it('creates a new row when the account is not connected yet', async () => {
    repo.findOne.mockResolvedValue(null);

    const saved = await service.upsertIntegration(baseInput);

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { provider: IntegrationProvider.GOOGLE, accountId: 'google-sub-1' },
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
    const savedArg = repo.save.mock.calls[0][0] as UserIntegration;
    expect(savedArg.firebaseId).toBe('user-1');
    expect(savedArg.accountId).toBe('google-sub-1');
    expect(savedArg.status).toBe(IntegrationStatus.ACTIVE);
    expect(saved.id).toBe(42);
  });
  it('persists the connection business on a new mailbox',async()=>{
    repo.findOne.mockResolvedValue(null);
    await service.upsertIntegration({...baseInput,businessNumber:'123456789'});
    expect(repo.save.mock.calls[0][0]).toMatchObject({emailRouting:{businessNumber:'123456789',rules:[]}});
  });
  it('updates only the default business atomically on reconnect, preserving concurrent sender-rule edits',async()=>{
    repo.findOne.mockResolvedValue({id:10,firebaseId:'user-1',provider:IntegrationProvider.GOOGLE,accountId:'google-sub-1',connectedAccountId:'old',emailRouting:{businessNumber:'old-business',rules:[{sender:'blocked@example.com',action:'BLOCK'}]}} as UserIntegration);
    await service.upsertIntegration({...baseInput,businessNumber:'123456789'});
    const expression=query.set.mock.calls[0][0].emailRouting;
    expect(typeof expression).toBe('function');expect(expression()).toContain('JSON_SET');expect(expression()).toContain('$.businessNumber');
    expect(query.where.mock.calls[0][1]).toMatchObject({routingBusiness:'123456789'});
  });

  it('reconnecting the same account for the same user updates tokens WITHOUT resetting sync state', async () => {
    const existing = {
      id: 10,
      firebaseId: 'user-1',
      provider: IntegrationProvider.GOOGLE,
      accountId: 'google-sub-1',
      status: IntegrationStatus.REVOKED,
      initialImportCompletedAt: new Date('2026-01-01T00:00:00Z'),
      lastSuccessfulSyncAt: new Date('2026-02-01T00:00:00Z'),
      lastSyncStatus: null,
    } as UserIntegration;
    repo.findOne.mockResolvedValue(existing);

    const savedArg = await service.upsertIntegration(baseInput);

    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
    expect(query.set.mock.calls[0][0]).not.toHaveProperty('initialImportCompletedAt');
    expect(query.set.mock.calls[0][0]).not.toHaveProperty('lastSuccessfulSyncAt');
    expect(savedArg.id).toBe(10);
    expect(savedArg.status).toBe(IntegrationStatus.ACTIVE);
    // Sync state preserved — same mailbox.
    expect(savedArg.initialImportCompletedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(savedArg.lastSuccessfulSyncAt).toEqual(new Date('2026-02-01T00:00:00Z'));
  });

  it('lets the same user connect a different account (separate row)', async () => {
    repo.findOne.mockResolvedValue(null); // sub-2 not connected

    await service.upsertIntegration({ ...baseInput, accountId: 'google-sub-2' });

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { provider: IntegrationProvider.GOOGLE, accountId: 'google-sub-2' },
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
    const savedArg = repo.save.mock.calls[0][0] as UserIntegration;
    expect(savedArg.firebaseId).toBe('user-1');
    expect(savedArg.accountId).toBe('google-sub-2');
  });

  it('rejects connecting an account already linked to another user', async () => {
    repo.findOne.mockResolvedValue({
      id: 99,
      firebaseId: 'other-user',
      provider: IntegrationProvider.GOOGLE,
      accountId: 'google-sub-1',
      status: IntegrationStatus.ACTIVE,
    } as UserIntegration);

    await expect(service.upsertIntegration(baseInput)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects an upsert without an accountId', async () => {
    await expect(
      service.upsertIntegration({ ...baseInput, accountId: '' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('does not overwrite a connection when a sync starts after its initial lookup', async () => {
    repo.findOne.mockResolvedValue({ id: 10, firebaseId: 'user-1', connectedAccountId: 'ca-old', lastSyncStatus: null } as UserIntegration);
    query.execute.mockResolvedValue({ affected: 0 });
    await expect(service.upsertIntegration(baseInput)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
    expect(query.where).toHaveBeenCalledWith(expect.stringContaining('last_sync_status'), expect.objectContaining({ previousConnection: 'ca-old' }));
  });

  it('atomically rejects a second synchronization claim', async () => {
    query.execute.mockResolvedValue({ affected: 0 });
    await expect(service.markSyncRunning(10)).rejects.toBeInstanceOf(ConflictException);
    expect(query.where).toHaveBeenCalledWith(expect.stringContaining('last_sync_status'), expect.objectContaining({ id: 10, active: IntegrationStatus.ACTIVE }));
  });

  it('keeps retired account IDs until remote cleanup has succeeded', async () => {
    repo.findOne.mockResolvedValue({ id: 10, firebaseId: 'user-1', connectedAccountId: 'ca-old', lastSyncStatus: null, retiredConnectedAccountIds: ['ca-older'] } as UserIntegration);
    const result = await service.upsertIntegration(baseInput);
    expect(result.retiredConnectedAccountIds).toEqual(['ca-older', 'ca-old']);
  });

  describe('findAllVisibleByUserAndProvider', () => {
    it('excludes REVOKED accounts (returns ACTIVE + EXPIRED only)', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAllVisibleByUserAndProvider('user-1', IntegrationProvider.GOOGLE);

      expect(repo.find).toHaveBeenCalledWith({
        where: [
          { firebaseId: 'user-1', provider: IntegrationProvider.GOOGLE, status: Not(IntegrationStatus.REVOKED) },
          { firebaseId: 'user-1', provider: IntegrationProvider.GOOGLE, remoteDisconnectPending: true },
        ],
        order: { id: 'ASC' },
      });
    });
  });

  describe('findOwnedByIdOrThrow', () => {
    it('returns the integration when it belongs to the user', async () => {
      const integration = { id: 5, firebaseId: 'user-1' } as UserIntegration;
      repo.findOne.mockResolvedValue(integration);

      await expect(service.findOwnedByIdOrThrow(5, 'user-1')).resolves.toBe(integration);
    });

    it('throws NotFound when the integration is missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOwnedByIdOrThrow(5, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFound when the integration belongs to another user', async () => {
      repo.findOne.mockResolvedValue({ id: 5, firebaseId: 'other' } as UserIntegration);
      await expect(service.findOwnedByIdOrThrow(5, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
