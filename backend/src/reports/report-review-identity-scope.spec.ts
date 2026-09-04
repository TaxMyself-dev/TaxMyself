import { ForbiddenException } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { ReportReviewService } from './report-review.service';

function queryBuilder(result: unknown[] = []) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    innerJoin: jest.fn(() => qb),
    innerJoinAndMapOne: jest.fn(() => qb),
    select: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue(result),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  return qb;
}

describe('report review identity boundaries', () => {
  it('ingests a represented client inbox without exposing self-service review signals', async () => {
    const processInboxForUser = jest.fn().mockResolvedValue({ processed: 1, total: 1 });
    const service: any = Object.create(ReportReviewService.prototype);
    Object.assign(service, {
      userRepo: {
        findOne: jest.fn().mockResolvedValue({ index: 41, hasOpenBanking: false }),
      },
      businessRepo: { findOne: jest.fn().mockResolvedValue({ id: 7 }) },
      sharedService: { isRepresentedByAccountant: jest.fn().mockResolvedValue(true) },
      documentsService: { processInboxForUser },
      ocrQueueService: { isEnabled: jest.fn().mockReturnValue(false) },
      docRepo: { createQueryBuilder: jest.fn() },
      logger: { warn: jest.fn() },
    });

    await expect(
      service.previewCheck('represented-user', '515151515', new Date('2026-08-31')),
    ).resolves.toEqual({
      hasPendingDocs: false,
      hasUnconfirmedExpenses: false,
      documentsProcessing: false,
    });

    expect(processInboxForUser).toHaveBeenCalledWith('represented-user', '515151515');
    expect(service.docRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('queues represented-client OCR without waiting when Cloud Tasks is enabled', async () => {
    const enqueue = jest.fn().mockResolvedValue({ queued: true, duplicate: false });
    const processInboxForUser = jest.fn();
    const service: any = Object.create(ReportReviewService.prototype);
    Object.assign(service, {
      userRepo: {
        findOne: jest.fn().mockResolvedValue({ index: 41, hasOpenBanking: false }),
      },
      businessRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 7,
          driveInboxFolderId: 'inbox-folder',
        }),
      },
      sharedService: { isRepresentedByAccountant: jest.fn().mockResolvedValue(true) },
      documentsService: { processInboxForUser },
      googleDriveService: {
        listFolderFiles: jest.fn().mockResolvedValue([{ id: 'drive-file' }]),
      },
      ocrQueueService: {
        isEnabled: jest.fn().mockReturnValue(true),
        enqueue,
      },
      docRepo: { createQueryBuilder: jest.fn() },
      logger: { warn: jest.fn() },
    });

    await expect(
      service.previewCheck('represented-user', '515151515', new Date('2026-08-31')),
    ).resolves.toEqual({
      hasPendingDocs: false,
      hasUnconfirmedExpenses: false,
      documentsProcessing: true,
    });

    expect(enqueue).toHaveBeenCalledWith(
      { firebaseId: 'represented-user', businessNumber: '515151515' },
      expect.stringMatching(/^report:represented-user:515151515:/),
    );
    expect(processInboxForUser).not.toHaveBeenCalled();
  });

  it('scopes the cheap pending-document check by effective user and business', async () => {
    const docsQb = queryBuilder();
    const service: any = Object.create(ReportReviewService.prototype);
    Object.assign(service, {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 41, hasOpenBanking: false }) },
      businessRepo: { findOne: jest.fn().mockResolvedValue({ id: 7, driveInboxFolderId: null }) },
      sharedService: { isRepresentedByAccountant: jest.fn().mockResolvedValue(false) },
      ocrQueueService: { isEnabled: jest.fn().mockReturnValue(false) },
      docRepo: { createQueryBuilder: jest.fn(() => docsQb) },
    });

    await service.previewCheck('effective-user', '515151515', new Date('2026-08-31'));

    expect(service.businessRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { firebaseId: 'effective-user', businessNumber: '515151515' },
    }));
    expect(docsQb.where).toHaveBeenCalledWith('d.userId = :uid', { uid: 41 });
    expect(docsQb.andWhere).toHaveBeenCalledWith(
      'd.businessNumber = :bn',
      { bn: '515151515' },
    );
  });

  it('queues inbox OCR and does not report unprocessed files as reviewable rows', async () => {
    const docsQb = queryBuilder();
    const enqueue = jest.fn().mockResolvedValue({ queued: true, duplicate: false });
    const service: any = Object.create(ReportReviewService.prototype);
    Object.assign(service, {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 41, hasOpenBanking: false }) },
      businessRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 7, driveInboxFolderId: 'inbox-folder' }),
      },
      sharedService: { isRepresentedByAccountant: jest.fn().mockResolvedValue(false) },
      docRepo: { createQueryBuilder: jest.fn(() => docsQb) },
      googleDriveService: {
        listFolderFiles: jest.fn().mockResolvedValue([{ id: 'drive-file' }]),
      },
      ocrQueueService: {
        isEnabled: jest.fn().mockReturnValue(true),
        enqueue,
      },
    });

    await expect(
      service.previewCheck('effective-user', '515151515', new Date('2026-08-31')),
    ).resolves.toEqual({
      hasPendingDocs: false,
      hasUnconfirmedExpenses: false,
      documentsProcessing: true,
    });
    expect(enqueue).toHaveBeenCalled();
  });

  it('rejects a business that is not owned by the effective user before querying rows', async () => {
    const createQueryBuilder = jest.fn();
    const service: any = Object.create(ReportReviewService.prototype);
    Object.assign(service, {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 41, hasOpenBanking: false }) },
      businessRepo: { findOne: jest.fn().mockResolvedValue(null) },
      docRepo: { createQueryBuilder },
    });

    await expect(
      service.previewCheck('accountant-own-user', 'client-business', new Date('2026-08-31')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('scopes matching candidates by both document owner and transaction owner', async () => {
    const docsQb = queryBuilder([{ id: 5, supplier: 'Supplier', date: new Date(), amount: 100 }]);
    const slimQb = queryBuilder();
    const service = new MatchingService(
      { createQueryBuilder: jest.fn(() => docsQb) } as any,
      { createQueryBuilder: jest.fn(() => slimQb) } as any,
      {} as any,
      {} as any,
    );

    await service.matchDocumentsForBusiness(
      'effective-user',
      41,
      '515151515',
      { from: new Date('2026-08-01'), to: new Date('2026-08-31') },
    );

    expect(docsQb.where).toHaveBeenCalledWith('d.userId = :uid', { uid: 41 });
    expect(slimQb.where).toHaveBeenCalledWith('slim.userId = :uid', { uid: 'effective-user' });
  });
});
