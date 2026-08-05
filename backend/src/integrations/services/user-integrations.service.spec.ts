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

  const baseInput = {
    firebaseId: 'user-1',
    provider: IntegrationProvider.GOOGLE,
    accountId: 'google-sub-1',
    refreshToken: 'refresh-token',
    accessToken: 'access-token',
    accountEmail: 'a@example.com',
    scopes: 'openid https://www.googleapis.com/auth/gmail.readonly',
    expiresAt: null,
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((entity) => entity as UserIntegration),
      save: jest.fn((entity) => Promise.resolve({ id: 42, ...entity } as UserIntegration)),
      update: jest.fn(),
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

    await service.upsertIntegration(baseInput);

    expect(repo.create).not.toHaveBeenCalled();
    const savedArg = repo.save.mock.calls[0][0] as UserIntegration;
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

  describe('findAllVisibleByUserAndProvider', () => {
    it('excludes REVOKED accounts (returns ACTIVE + EXPIRED only)', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAllVisibleByUserAndProvider('user-1', IntegrationProvider.GOOGLE);

      expect(repo.find).toHaveBeenCalledWith({
        where: {
          firebaseId: 'user-1',
          provider: IntegrationProvider.GOOGLE,
          status: Not(IntegrationStatus.REVOKED),
        },
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
