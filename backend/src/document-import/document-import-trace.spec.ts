import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DocumentImportService } from './document-import.service';
import { DocumentImportSource } from './enums/document-import.enums';
import { DocumentImportBlockedError } from './document-import-blocked.error';
import { traceImportStep } from './document-import-trace';

describe('import phase timing — simulated clock, SQL and Drive only', () => {
  const request = {
    firebaseId: 'private-owner',
    businessNumber: 'private-business',
    filename: 'private-filename.pdf',
    source: DocumentImportSource.API_IMPORT,
    content: Buffer.from('%PDF-private-bytes'),
    mimeType: 'application/pdf',
    traceEventId: 'test-import-event',
  };
  let now: number,
    db: any,
    businesses: any,
    drive: any,
    service: DocumentImportService;
  let debug: jest.SpyInstance, warn: jest.SpyInstance;
  const records = () =>
    [...debug.mock.calls, ...warn.mock.calls]
      .map((call) => call[0])
      .filter((value) => typeof value === 'string' && value.startsWith('{'))
      .map((value) => JSON.parse(value))
      .filter((entry) => entry.event_id === request.traceEventId);
  const duration = (stage: string) =>
    records().find(
      (e) => e.stage === `drive.import.${stage}` && e.outcome === 'completed',
    )?.durationMs;
  beforeEach(() => {
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    db = {
      findOne: jest.fn(async () => {
        now += 13;
        return null;
      }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        now += 29;
        return { ...value, id: 1 };
      }),
    };
    businesses = {
      findOne: jest.fn(async () => {
        now += 17;
        return {
          driveInboxFolderId: 'private-inbox',
          driveProcessedFolderId: 'private-processed',
        };
      }),
      save: jest.fn(),
    };
    drive = {
      listFolderFiles: jest.fn(async () => {
        now += 19;
        return [];
      }),
      uploadFile: jest.fn(async () => {
        now += 23;
        return 'private-file-id';
      }),
      deleteFile: jest.fn(async () => {
        now += 7;
      }),
      downloadFile: jest.fn(async () => {
        now += 31;
        return request.content;
      }),
      ensureInboxAndProcessed: jest.fn(async () => {
        now += 41;
        return {
          inboxFolderId: 'private-inbox',
          processedFolderId: 'private-processed',
        };
      }),
    };
    service = new DocumentImportService(db, businesses, drive, {} as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('measures database, listing, upload and registration separately without leaking values', async () => {
    expect((await service.importDocument(request)).status).toBe('IMPORTED');
    expect(duration('db.dedup')).toBe(13);
    expect(duration('db.folder_lookup')).toBe(17);
    expect(duration('drive.list')).toBe(38);
    expect(duration('drive.upload')).toBe(23);
    expect(duration('db.import_save')).toBe(29);
    const output = JSON.stringify(records());
    for (const secret of [
      'private-owner',
      'private-business',
      'private-filename',
      'private-bytes',
      'private-inbox',
      'private-file-id',
    ])
      expect(output).not.toContain(secret);
    expect(db.create.mock.calls[0][0]).not.toHaveProperty('traceEventId');
  });
  it('stops measurement at the ledger duplicate without any Drive operations', async () => {
    db.findOne.mockResolvedValueOnce({
      id: 3,
      driveFileId: 'private-existing',
      driveFileName: 'private-existing-name',
    });
    expect((await service.importDocument(request)).status).toBe(
      'ALREADY_IMPORTED',
    );
    expect(records().some((e) => e.stage === 'drive.import.db.dedup')).toBe(
      true,
    );
    expect(drive.listFolderFiles).not.toHaveBeenCalled();
    expect(drive.uploadFile).not.toHaveBeenCalled();
    expect(records().some((e) => e.stage === 'drive.import.drive.upload')).toBe(
      false,
    );
  });
  it('measures orphan recovery separately and never uploads or deletes the recovered file', async () => {
    drive.listFolderFiles.mockImplementation(async (folder) => {
      now += 19;
      return folder === 'private-inbox'
        ? [
            {
              id: 'private-recovered',
              name: 'private-name.pdf',
              md5Checksum: createHash('md5')
                .update(request.content)
                .digest('hex'),
              size: request.content.length,
            },
          ]
        : [];
    });
    expect((await service.importDocument(request)).status).toBe('IMPORTED');
    expect(duration('drive.recovery.verify')).toBe(31);
    expect(duration('db.import_save')).toBe(29);
    expect(drive.uploadFile).not.toHaveBeenCalled();
    expect(drive.deleteFile).not.toHaveBeenCalled();
  });
  it('measures folder provisioning and folder-ID persistence without changing the flow', async () => {
    businesses.findOne.mockResolvedValueOnce({
      driveFolderId: 'private-business-folder',
    });
    businesses.save.mockImplementation(async (value) => {
      now += 11;
      return value;
    });
    await service.importDocument(request);
    expect(duration('drive.provision')).toBe(41);
    expect(duration('db.folder_save')).toBe(11);
  });
  it('reports a missing business folder as a typed blocker, without attempting Drive work', async () => {
    businesses.findOne.mockResolvedValueOnce({
      driveFolderId: null,
      driveInboxFolderId: null,
    });
    await expect(service.importDocument(request)).rejects.toMatchObject({
      blockCode: 'DRIVE_FOLDER_MISSING',
    });
    expect(drive.listFolderFiles).not.toHaveBeenCalled();
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });
  it('measures failed registration and compensation but does not change their result', async () => {
    db.save.mockImplementationOnce(async () => {
      now += 29;
      throw new Error('private-db-message');
    });
    expect((await service.importDocument(request)).status).toBe('SKIPPED');
    expect(records()).toContainEqual(
      expect.objectContaining({
        stage: 'drive.import.db.import_save',
        outcome: 'failed',
        durationMs: 29,
      }),
    );
    expect(duration('drive.cleanup')).toBe(7);
    expect(JSON.stringify(records())).not.toContain('private-db-message');
  });
  it('does not enable trace logging for other callers without an event ID', async () => {
    await service.importDocument({ ...request, traceEventId: undefined });
    expect(records()).toEqual([]);
  });
  it('rethrows the exact typed error and never records its private message', async () => {
    const error = new DocumentImportBlockedError(
      'DRIVE_FOLDER_MISSING',
      'private-error-body',
    );
    await expect(
      traceImportStep(request.traceEventId, 'drive.upload', async () => {
        now += 37;
        throw error;
      }),
    ).rejects.toBe(error);
    expect(records()).toContainEqual(
      expect.objectContaining({ outcome: 'failed', durationMs: 37 }),
    );
    expect(JSON.stringify(records())).not.toContain('private-error-body');
  });
  it('ignores an invalid correlation ID instead of logging arbitrary text', async () => {
    const work = jest.fn(async () => 'private-result');
    expect(
      await traceImportStep('unsafe\ncorrelation', 'drive.upload', work),
    ).toBe('private-result');
    expect(work).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
