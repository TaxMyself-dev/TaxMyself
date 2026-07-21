import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DocumentImportDestination,
  DocumentImportService,
} from 'src/document-import/document-import.service';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationProvider } from '../enums/integrations.enums';
import {
  GmailDriveImportService,
  GmailImportResult,
} from './gmail-drive-import.service';
import { GmailReaderService } from './gmail-reader.service';
import { UserIntegrationsService } from './user-integrations.service';

describe('GmailDriveImportService — importAllForUser', () => {
  let service: GmailDriveImportService;
  let userIntegrationsService: jest.Mocked<Pick<UserIntegrationsService, 'findAllActiveByUserAndProvider'>>;

  /** What the import pipeline reports back as the business it stored under. */
  const destination: DocumentImportDestination = {
    businessNumber: '123456789',
    businessName: 'העסק שלי',
  };

  // Initial import completed by default — manual import requires it.
  const integration = (
    id: number,
    email: string,
    over: Partial<UserIntegration> = {},
  ): UserIntegration =>
    ({
      id,
      accountEmail: email,
      firebaseId: 'user-1',
      provider: IntegrationProvider.GOOGLE,
      initialImportCompletedAt: new Date('2026-01-01T00:00:00Z'),
      ...over,
    } as UserIntegration);

  const importResult = (over: Partial<GmailImportResult> = {}): GmailImportResult => ({
    query: 'q',
    messagesFound: 1,
    messagesFailed: 0,
    failedMessageIds: [],
    attachmentsFound: 1,
    imported: 1,
    alreadyImported: 0,
    failedFiles: 0,
    destinations: [destination],
    files: [],
    ...over,
  });

  beforeEach(async () => {
    userIntegrationsService = {
      findAllActiveByUserAndProvider: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailDriveImportService,
        { provide: GmailReaderService, useValue: {} },
        { provide: DocumentImportService, useValue: {} },
        { provide: UserIntegrationsService, useValue: userIntegrationsService },
      ],
    }).compile();

    service = module.get(GmailDriveImportService);
  });

  it('throws when the user has no active Gmail accounts', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([]);

    await expect(service.importAllForUser('user-1', [1], {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects ids that are not the caller`s ACTIVE Google integrations, before importing anything', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
    ]);
    const importFromGmail = jest.spyOn(service, 'importFromGmail');

    // id 99 is foreign / EXPIRED / nonexistent — indistinguishable by design.
    await expect(service.importAllForUser('user-1', [1, 99], {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(importFromGmail).not.toHaveBeenCalled();
  });

  it('rejects ACTIVE accounts that have not completed their initial import, before importing anything', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'ready@example.com'),
      integration(2, 'pending@example.com', { initialImportCompletedAt: null }),
    ]);
    const importFromGmail = jest.spyOn(service, 'importFromGmail');

    await expect(service.importAllForUser('user-1', [1, 2], {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(importFromGmail).not.toHaveBeenCalled();
  });

  it('imports ONLY the selected accounts and aggregates totals', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
      integration(2, 'b@example.com'),
      integration(3, 'c@example.com'),
    ]);
    const importFromGmail = jest
      .spyOn(service, 'importFromGmail')
      .mockResolvedValueOnce(importResult({ imported: 2, attachmentsFound: 3 }))
      .mockResolvedValueOnce(importResult({ imported: 1, alreadyImported: 4, attachmentsFound: 5 }));

    const result = await service.importAllForUser('user-1', [1, 3], {});

    expect(importFromGmail).toHaveBeenCalledTimes(2);
    expect(importFromGmail.mock.calls[0][0].id).toBe(1);
    expect(importFromGmail.mock.calls[1][0].id).toBe(3);
    expect(result.runType).toBe('MANUAL');
    expect(result.totalImported).toBe(3);
    expect(result.totalAlreadyImported).toBe(4);
    expect(result.perAccount).toHaveLength(2);
    expect(result.perAccount[0]).toMatchObject({
      integrationId: 1,
      imported: 2,
      errorCode: null,
    });
    expect(result.perAccount[1]).toMatchObject({
      integrationId: 3,
      imported: 1,
      errorCode: null,
    });
  });

  it('imports a duplicated id only once', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
    ]);
    const importFromGmail = jest
      .spyOn(service, 'importFromGmail')
      .mockResolvedValue(importResult());

    const result = await service.importAllForUser('user-1', [1, 1], {});

    expect(importFromGmail).toHaveBeenCalledTimes(1);
    expect(result.perAccount).toHaveLength(1);
  });

  it('does not let one failing mailbox stop the others', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'fails@example.com'),
      integration(2, 'ok@example.com'),
    ]);
    jest
      .spyOn(service, 'importFromGmail')
      .mockRejectedValueOnce(new Error('token expired'))
      .mockResolvedValueOnce(importResult({ imported: 7, attachmentsFound: 7 }));

    const result = await service.importAllForUser('user-1', [1, 2], {});

    expect(result.totalImported).toBe(7);
    // A code, never the raw 'token expired' text.
    expect(result.perAccount[0]).toMatchObject({
      integrationId: 1,
      errorCode: 'ACCOUNT_NEEDS_RECONNECT',
    });
    expect(result.perAccount[1]).toMatchObject({
      integrationId: 2,
      imported: 7,
      errorCode: null,
    });
    expect(JSON.stringify(result)).not.toContain('token expired');
  });

  it('reports the destination the import pipeline actually used', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
      integration(2, 'b@example.com'),
    ]);
    jest.spyOn(service, 'importFromGmail').mockResolvedValue(importResult());

    const result = await service.importAllForUser('user-1', [1, 2], {});

    // Both mailboxes reported the same business — reported once, not twice.
    expect(result.destinations).toEqual([destination]);
  });

  it('reports every distinct destination rather than assuming a single business', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
      integration(2, 'b@example.com'),
    ]);
    const other: DocumentImportDestination = {
      businessNumber: '987654321',
      businessName: 'עסק שני',
    };
    jest
      .spyOn(service, 'importFromGmail')
      .mockResolvedValueOnce(importResult())
      .mockResolvedValueOnce(importResult({ destinations: [other] }));

    const result = await service.importAllForUser('user-1', [1, 2], {});

    expect(result.destinations).toEqual([destination, other]);
  });

  it('reports no destination when nothing was handled', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
    ]);
    jest
      .spyOn(service, 'importFromGmail')
      .mockResolvedValue(
        importResult({ imported: 0, attachmentsFound: 0, messagesFound: 0, destinations: [] }),
      );

    const result = await service.importAllForUser('user-1', [1], {});

    // Nothing was stored, so the summary claims no business.
    expect(result.destinations).toEqual([]);
    expect(result.totalImported).toBe(0);
  });

  it('never passes a business number into the import pipeline', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
    ]);
    const importFromGmail = jest
      .spyOn(service, 'importFromGmail')
      .mockResolvedValue(importResult());

    await service.importAllForUser('user-1', [1], {});

    expect(importFromGmail.mock.calls[0][1]).not.toHaveProperty('businessNumber');
  });

  it('separates expected skips from failures in the totals', async () => {
    userIntegrationsService.findAllActiveByUserAndProvider.mockResolvedValue([
      integration(1, 'a@example.com'),
    ]);
    jest.spyOn(service, 'importFromGmail').mockImplementation(async (_integration, options) => {
      // The reader records expected skips (logos, non-invoice files) on the
      // accumulator the caller passed in.
      options.skipStats?.record('asset-like filename', 'logo.png');
      options.skipStats?.record('image too small', 'spacer.gif');
      return importResult({
        imported: 3,
        alreadyImported: 2,
        failedFiles: 1, // per-file failure (Drive upload / ledger insert)
        messagesFailed: 1,
        attachmentsFound: 6,
      });
    });

    const result = await service.importAllForUser('user-1', [1], {});

    expect(result.totalImported).toBe(3);
    expect(result.totalAlreadyImported).toBe(2);
    expect(result.totalSkippedIrrelevant).toBe(2);
    expect(result.totalFailed).toBe(2); // 1 file failure + 1 unreadable message
    expect(result.perAccount[0]).toMatchObject({ skippedIrrelevant: 2, failed: 2 });
  });
});
