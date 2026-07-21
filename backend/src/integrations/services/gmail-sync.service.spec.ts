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
      markSyncError: jest.fn(),
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
      imported: 0,
      alreadyImported: 0,
      failedFiles: 0,
      destinations: [],
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

  it('clears any stored import summary on a nightly run', async () => {
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
      imported: 0,
      alreadyImported: 0,
      failedFiles: 0,
      destinations: [],
      files: [],
    });

    await service.runIncrementalSync(integration);

    // Nobody is waiting for the nightly run — a leftover initial-import
    // summary must not resurface as a completion dialog days later.
    expect(userIntegrationsService.markSyncSuccess).toHaveBeenCalledWith(
      55,
      expect.objectContaining({ importSummary: null }),
    );
  });
});

describe('GmailSyncService — the initial import publishes a user-facing summary', () => {
  let service: GmailSyncService;
  let importService: jest.Mocked<Pick<GmailDriveImportService, 'importAccount'>>;
  let userIntegrationsService: jest.Mocked<
    Pick<
      UserIntegrationsService,
      'findOwnedByIdOrThrow' | 'markSyncRunning' | 'markSyncSuccess' | 'markSyncError'
    >
  >;

  const integration = {
    id: 55,
    firebaseId: 'user-1',
    provider: IntegrationProvider.GOOGLE,
    accountEmail: 'a@example.com',
    status: IntegrationStatus.ACTIVE,
    lastSyncStatus: null,
    initialImportCompletedAt: null,
  } as UserIntegration;

  beforeEach(async () => {
    importService = { importAccount: jest.fn() };
    userIntegrationsService = {
      findOwnedByIdOrThrow: jest.fn().mockResolvedValue(integration),
      markSyncRunning: jest.fn().mockResolvedValue(undefined),
      markSyncSuccess: jest.fn().mockResolvedValue(undefined),
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

  /** startInitialImport kicks the run off un-awaited; let it settle. */
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('persists the summary of a successful run alongside the cursor', async () => {
    importService.importAccount.mockResolvedValue({
      summary: {
        integrationId: 55,
        accountEmail: 'a@example.com',
        imported: 18,
        alreadyImported: 4,
        skippedIrrelevant: 6,
        failed: 0,
        errorCode: null,
      },
      destinations: [{ businessNumber: '123456789', businessName: 'העסק שלי' }],
    });

    await service.startInitialImport('user-1', 55, '2026-01-01', '2026-01-31');
    await flush();

    const [, options] = userIntegrationsService.markSyncSuccess.mock.calls[0];
    expect(options.importSummary).toMatchObject({
      runType: 'INITIAL',
      totalImported: 18,
      totalAlreadyImported: 4,
      totalSkippedIrrelevant: 6,
      totalFailed: 0,
      destinations: [{ businessNumber: '123456789', businessName: 'העסק שלי' }],
    });
  });

  it('persists the summary of a FAILED run too, without advancing the cursor', async () => {
    importService.importAccount.mockResolvedValue({
      summary: {
        integrationId: 55,
        accountEmail: 'a@example.com',
        imported: 2,
        alreadyImported: 0,
        skippedIrrelevant: 0,
        failed: 1,
        errorCode: 'ACCOUNT_NEEDS_RECONNECT',
      },
      destinations: [{ businessNumber: '123456789', businessName: 'העסק שלי' }],
    });

    await service.startInitialImport('user-1', 55, '2026-01-01', '2026-01-31');
    await flush();

    expect(userIntegrationsService.markSyncSuccess).not.toHaveBeenCalled();
    const [, , summary] = userIntegrationsService.markSyncError.mock.calls[0];
    expect(summary).toMatchObject({
      runType: 'INITIAL',
      totalImported: 2,
      perAccount: [expect.objectContaining({ errorCode: 'ACCOUNT_NEEDS_RECONNECT' })],
    });
  });
});
