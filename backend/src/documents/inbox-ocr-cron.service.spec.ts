import { InboxOcrCronService } from './inbox-ocr-cron.service';

describe('InboxOcrCronService', () => {
  it('processes every provisioned business and isolates a business failure', async () => {
    const businessRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 1, firebaseId: 'owner-1', businessNumber: '111' },
        { id: 2, firebaseId: 'owner-2', businessNumber: '222' },
      ]),
    };
    const documentsService = {
      processInboxForUser: jest.fn()
        .mockResolvedValueOnce({ processed: 2, failed: 1 })
        .mockRejectedValueOnce(new Error('drive unavailable')),
    };
    const service = new InboxOcrCronService(
      businessRepo as any,
      documentsService as any,
    );

    await expect(service.processProvisionedInboxes()).resolves.toEqual({
      eligibleBusinesses: 2,
      processedDocuments: 2,
      failedDocuments: 1,
      businessErrors: 1,
    });
    expect(documentsService.processInboxForUser).toHaveBeenNthCalledWith(1, 'owner-1', '111');
    expect(documentsService.processInboxForUser).toHaveBeenNthCalledWith(2, 'owner-2', '222');
  });

  it('does not overlap scheduled sweeps in the same instance', async () => {
    let finish!: () => void;
    const pending = new Promise<any>(resolve => {
      finish = () => resolve({
        eligibleBusinesses: 0,
        processedDocuments: 0,
        failedDocuments: 0,
        businessErrors: 0,
      });
    });
    const service = new InboxOcrCronService({} as any, {} as any);
    service.processProvisionedInboxes = jest.fn().mockReturnValue(pending);

    const first = service.runScheduledSweep();
    await service.runScheduledSweep();
    expect(service.processProvisionedInboxes).toHaveBeenCalledTimes(1);
    finish();
    await first;
  });
});
