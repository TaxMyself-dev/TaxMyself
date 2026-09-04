import { DocumentsService } from './documents.service';

describe('DocumentsService inbox OCR lock', () => {
  function setup(acquired: number) {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ acquired }])
      .mockResolvedValueOnce([{ released: 1 }]);
    const release = jest.fn().mockResolvedValue(undefined);
    const service: any = Object.create(DocumentsService.prototype);
    Object.assign(service, {
      dataSource: {
        createQueryRunner: () => ({
          connect: jest.fn().mockResolvedValue(undefined),
          query,
          release,
        }),
      },
      logger: { warn: jest.fn() },
      activeInboxOcr: 0,
      maxConcurrentInboxOcr: 3,
      inboxOcrWaiters: [],
    });
    service.processInboxForUserUnlocked = jest.fn().mockResolvedValue({
      processed: 1,
      failed: 0,
      skipped: 0,
      duplicates: 0,
      restored: 0,
      total: 1,
      inboxFolderId: 'inbox',
      processedFolderId: 'processed',
    });
    return { service, query, release };
  }

  it('holds and releases one advisory lock around OCR', async () => {
    const { service, query, release } = setup(1);

    await expect(
      service.processInboxForUser('firebase-user', '123456789'),
    ).resolves.toEqual(expect.objectContaining({
      processed: 1,
      alreadyProcessing: false,
    }));

    expect(service.processInboxForUserUnlocked).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT GET_LOCK(?, 0) AS acquired',
      [expect.stringMatching(/^inbox-ocr:[a-f0-9]{48}$/)],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'SELECT RELEASE_LOCK(?)',
      [expect.stringMatching(/^inbox-ocr:[a-f0-9]{48}$/)],
    );
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns immediately when another instance already owns the lock', async () => {
    const { service, query, release } = setup(0);

    await expect(
      service.processInboxForUser('firebase-user', '123456789'),
    ).resolves.toEqual(expect.objectContaining({
      alreadyProcessing: true,
      processed: 0,
    }));

    expect(service.processInboxForUserUnlocked).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
