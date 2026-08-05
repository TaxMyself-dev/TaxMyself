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
});
