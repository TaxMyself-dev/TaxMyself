import { Test, TestingModule } from '@nestjs/testing';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';
import { GmailDriveImportService } from './gmail-drive-import.service';
import { GmailSyncService } from './gmail-sync.service';
import { UserIntegrationsService } from './user-integrations.service';

describe('GmailSyncService — incremental sync targets the specific integration', () => {
  let service: GmailSyncService;
  let importService: jest.Mocked<Pick<GmailDriveImportService, 'importFromGmail'>>;
  let userIntegrationsService: jest.Mocked<
    Pick<UserIntegrationsService, 'markSyncRunning' | 'markSyncSuccess' | 'markSyncError'>
  >;

  beforeEach(async () => {
    importService = { importFromGmail: jest.fn() };
    userIntegrationsService = {
      markSyncRunning: jest.fn(),
      markSyncSuccess: jest.fn(),
      markSyncError: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailSyncService,
        { provide: GmailDriveImportService, useValue: importService },
        { provide: UserIntegrationsService, useValue: userIntegrationsService },
      ],
    }).compile();

    service = module.get(GmailSyncService);
  });

  it('calls importFromGmail with the integration row, not a firebaseId lookup', async () => {
    const integration = {
      id: 55,
      firebaseId: 'user-1',
      provider: IntegrationProvider.GOOGLE,
      accountEmail: 'a@example.com',
      status: IntegrationStatus.ACTIVE,
      lastSyncStatus: null,
      lastSuccessfulSyncAt: new Date('2026-06-01T00:00:00Z'),
    } as UserIntegration;

    importService.importFromGmail.mockResolvedValue({
      query: 'q',
      messagesFound: 0,
      messagesFailed: 0,
      failedMessageIds: [],
      attachmentsFound: 0,
      matchedByPdfContent: 0,
      imported: 0,
      alreadyImported: 0,
      skipped: 0,
      files: [],
    });

    const result = await service.runIncrementalSync(integration);

    expect(result.outcome).toBe('success');
    expect(importService.importFromGmail).toHaveBeenCalledTimes(1);
    const [passedIntegration] = importService.importFromGmail.mock.calls[0];
    expect(passedIntegration).toBe(integration);
    expect(userIntegrationsService.markSyncRunning).toHaveBeenCalledWith(55);
    expect(userIntegrationsService.markSyncSuccess).toHaveBeenCalledWith(
      55,
      expect.objectContaining({ lastSuccessfulSyncAt: expect.any(Date) }),
    );
  });

  it('does not advance the cursor when one message fails', async () => {
    importService.importFromGmail.mockResolvedValue({ messagesFailed: 1 } as any);
    const result = await service.runIncrementalSync({ id: 55, firebaseId: 'user-1', lastSuccessfulSyncAt: new Date('2026-06-01'), lastSyncStatus: null } as UserIntegration);
    expect(result.outcome).toBe('error');
    expect(userIntegrationsService.markSyncSuccess).not.toHaveBeenCalled();
    expect(userIntegrationsService.markSyncError).toHaveBeenCalledWith(55, expect.any(String));
  });

  it('does not complete initial import after a partial scan', async () => {
    importService.importFromGmail.mockResolvedValue({ messagesFailed: 1 } as any);
    await (service as any).runInitialImport({ id: 55 }, { integrationId: 55, syncType: 'INITIAL' }, '2026-01-01', '2026-02-01');
    expect(userIntegrationsService.markSyncSuccess).not.toHaveBeenCalled();
    expect(userIntegrationsService.markSyncError).toHaveBeenCalled();
  });

  it('contains an atomic claim conflict without running or overwriting another run', async () => {
    const { ConflictException } = await import('@nestjs/common');
    userIntegrationsService.markSyncRunning.mockRejectedValue(new ConflictException());
    const result = await service.runIncrementalSync({ id: 55, lastSuccessfulSyncAt: new Date('2026-06-01') } as UserIntegration);
    expect(result.outcome).toBe('skipped');
    expect(importService.importFromGmail).not.toHaveBeenCalled();
    expect(userIntegrationsService.markSyncError).not.toHaveBeenCalled();
  });
});

describe('Gmail status preserves historical errors after reconnect', () => {
  it.each([
    ['ACTIVE', '2026-11-17T00:00:00Z', true],
    ['ACTIVE', '2026-11-19T00:00:00Z', false],
    ['EXPIRED', '2026-11-17T00:00:00Z', false],
    ['ACTIVE', null, false],
  ])('classifies %s / %s without clearing history', async (status, startedAt, expected) => {
    const row = { id: 17, status, lastSyncStatus: 'ERROR', lastSyncError: 'original failure', connectionVerifiedAt: new Date('2026-11-18T00:00:00Z'), lastSyncStartedAt: startedAt ? new Date(startedAt as string) : null };
    const before = JSON.stringify(row);
    const integrations = { findAllVisibleByUserAndProvider: jest.fn().mockResolvedValue([row]) };
    const service = new GmailSyncService(integrations as any, {} as any);
    const result = await service.getSyncStatus('owner');
    expect(result.accounts[0].syncErrorPredatesConnection).toBe(expected);
    expect(result.accounts[0].lastSyncError).toBe('original failure');
    expect(result.accounts[0].lastSyncStatus).toBe('ERROR');
    expect(JSON.stringify(row)).toBe(before);
  });
});

describe('Unresolved intake prevents successful synchronization', () => {
  it('persists a review count without advancing the incremental cursor', async () => {
    const integrations = { markSyncRunning: jest.fn().mockResolvedValue(undefined), markSyncSuccess: jest.fn(), markSyncError: jest.fn().mockResolvedValue(undefined) };
    const importer = { importFromGmail: jest.fn().mockResolvedValue({ messagesFailed: 0, reviewRequired: 2 }) };
    const service = new GmailSyncService(integrations as any, importer as any);
    const result = await service.runIncrementalSync({ id: 17, firebaseId: 'owner', lastSuccessfulSyncAt: new Date('2026-09-01'), lastSyncStatus: null } as UserIntegration);
    expect(result.outcome).toBe('error');
    expect(integrations.markSyncSuccess).not.toHaveBeenCalled();
    expect(integrations.markSyncError).toHaveBeenCalledWith(17, expect.stringContaining('2 קבצים דורשים בדיקה'));
  });
});
