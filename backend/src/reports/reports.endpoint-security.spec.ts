import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../guards/admin.guard';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('Reports endpoint authorization', () => {
  const reportsService = {
    getDocsSummary: jest.fn(),
    parseAndSaveDebugFile: jest.fn(),
  };
  const usersService = {
    isAdmin: jest.fn(),
  };
  const controller = new ReportsController(
    reportsService as any,
    {} as any,
    {} as any,
    usersService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires FirebaseAuthGuard for document summaries', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ReportsController.prototype.getDocumentsSummary,
    ) ?? [];
    expect(guards).toContain(FirebaseAuthGuard);
  });

  it('runs both Firebase and admin guards before the debug upload interceptor', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ReportsController.prototype.uploadAndDebug,
    ) ?? [];
    expect(guards).toEqual([FirebaseAuthGuard, AdminGuard]);
  });

  it('passes the authenticated effective firebaseId into the summary ownership boundary', async () => {
    reportsService.getDocsSummary.mockResolvedValue([
      { docType: 'INVOICE', totalDocs: '2', totalSum: '100.50' },
    ]);

    const result = await controller.getDocumentsSummary(
      { user: { firebaseId: 'client-1' } } as any,
      '2026-01-01',
      '2026-12-31',
      '123456789',
    );

    expect(reportsService.getDocsSummary).toHaveBeenCalledWith(
      '2026-01-01',
      '2026-12-31',
      '123456789',
      'client-1',
    );
    expect(result).toEqual([
      { docType: 'INVOICE', totalDocs: 2, totalSum: 100.5 },
    ]);
  });

  it('allows the debug parser to run after the guards approve the request', async () => {
    reportsService.parseAndSaveDebugFile.mockResolvedValue('debug/output.txt');
    const response = { download: jest.fn() };

    await controller.uploadAndDebug(
      { filename: 'input.txt' } as any,
      response as any,
    );

    expect(reportsService.parseAndSaveDebugFile).toHaveBeenCalledWith('input.txt');
    expect(response.download).toHaveBeenCalledWith('debug/output.txt');
  });
});

describe('AdminGuard', () => {
  const usersService = { isAdmin: jest.fn() };
  const guard = new AdminGuard(usersService as any);

  function contextFor(user: Record<string, string>) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a non-admin before the upload interceptor can execute', async () => {
    usersService.isAdmin.mockResolvedValue(false);

    await expect(
      guard.canActivate(contextFor({ firebaseId: 'regular-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks the real actor rather than the impersonated client', async () => {
    usersService.isAdmin.mockResolvedValue(true);

    await expect(
      guard.canActivate(contextFor({
        firebaseId: 'impersonated-client',
        actorFirebaseId: 'admin-1',
      })),
    ).resolves.toBe(true);
    expect(usersService.isAdmin).toHaveBeenCalledWith('admin-1');
  });
});

describe('ReportsService.getDocsSummary ownership', () => {
  it('rejects a business that is not owned by the authenticated user before querying documents', async () => {
    const businessRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const documentsRepo = { createQueryBuilder: jest.fn() };

    await expect(
      ReportsService.prototype.getDocsSummary.call(
        { businessRepo, documentsRepo },
        '2026-01-01',
        '2026-12-31',
        '123456789',
        'client-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(businessRepo.findOne).toHaveBeenCalledWith({
      where: { businessNumber: '123456789', firebaseId: 'client-1' },
    });
    expect(documentsRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('queries document totals only after ownership is confirmed', async () => {
    const businessRepo = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const documentsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    await ReportsService.prototype.getDocsSummary.call(
      { businessRepo, documentsRepo },
      '2026-01-01',
      '2026-12-31',
      '123456789',
      'client-1',
    );

    expect(documentsRepo.createQueryBuilder).toHaveBeenCalledWith('doc');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'doc.issuerBusinessNumber = :businessNumber',
      { businessNumber: '123456789' },
    );
  });
});
