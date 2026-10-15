import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ShaamEnvironment } from '../shaam.constants';
import { UniformFileSubmission } from '../entities/uniform-file-submission.entity';
import {
  UniformFileRemoteStatus,
  UniformFileSubmissionState,
} from '../entities/shaam.enums';
import { UniformFileSubmissionService } from './uniform-file-submission.service';

describe('UniformFileSubmissionService', () => {
  const input = {
    businessId: 7,
    businessNumber: '222222226',
    ownerFirebaseId: 'effective-owner',
    actorFirebaseId: 'real-actor',
    environment: ShaamEnvironment.TSANDBOX,
    periodStart: '2026-02-01',
    periodEnd: '2026-03-31',
  };

  const artifacts = (ini = 'ini', bkm = 'bkm') => ({
    filePath: 'OPENFRMT/22222222.26/10151200',
    zipBuffer: Buffer.from('zip'),
    iniBuffer: Buffer.from(ini),
    bkmvdataBuffer: Buffer.from(bkm),
    document_summary: [],
    list_summary: [],
  });

  const hash = (value: string) => createHash('sha256').update(Buffer.from(value)).digest('hex');

  const entity = (overrides: Partial<UniformFileSubmission> = {}): UniformFileSubmission => ({
    id: 31,
    businessId: 7,
    business: null,
    businessNumberSnapshot: '222222226',
    actorFirebaseId: 'real-actor',
    environment: ShaamEnvironment.TSANDBOX,
    periodStart: '2026-02-01',
    periodEnd: '2026-03-31',
    representorCompanyId: null,
    state: UniformFileSubmissionState.GENERATED,
    iniStatus: null,
    bkmStatus: null,
    iniSha256: hash('ini'),
    bkmSha256: hash('bkm'),
    iniByteLength: '3',
    bkmByteLength: '3',
    shaamUniqueId: null,
    iniFileName: null,
    bkmFileName: null,
    iniFileUniqueId: null,
    bkmFileUniqueId: null,
    errorCategory: null,
    errorCode: null,
    errorMessage: null,
    retryCount: 0,
    generatedAt: new Date('2026-10-15T09:00:00.000Z'),
    uploadedAt: null,
    lastPolledAt: null,
    completedAt: null,
    createdAt: new Date('2026-10-15T09:00:01.000Z'),
    updatedAt: new Date('2026-10-15T09:00:01.000Z'),
    ...overrides,
  });

  function setup() {
    const repo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => entity({ ...value, id: 31 })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const reports = { createUniformFile: jest.fn().mockResolvedValue(artifacts()) };
    const uploads = {
      reserveUploadLinks: jest.fn(),
      uploadFile: jest.fn(),
      getFileStatuses: jest.fn(),
    };
    const service = new UniformFileSubmissionService(
      repo as any,
      reports as any,
      uploads as any,
    );
    return { service, repo, reports, uploads };
  }

  it('persists only hashes, byte lengths and safe metadata', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    const result = await service.prepare(input);

    expect(result).toEqual(expect.objectContaining({
      id: 31,
      businessNumber: '222222226',
      state: UniformFileSubmissionState.GENERATED,
      iniByteLength: '3',
      bkmByteLength: '3',
      reused: false,
    }));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      iniSha256: hash('ini'),
      bkmSha256: hash('bkm'),
      shaamUniqueId: null,
      iniFileUniqueId: null,
      bkmFileUniqueId: null,
    }));
    const persisted = repo.create.mock.calls[0][0];
    expect(persisted).not.toHaveProperty('iniBuffer');
    expect(persisted).not.toHaveProperty('bkmvdataBuffer');
    expect(persisted).not.toHaveProperty('zipBuffer');
  });

  it('regenerates with the stored timestamp and reuses an identical artifact', async () => {
    const { service, repo, reports } = setup();
    const existing = entity();
    repo.findOne.mockResolvedValue(existing);

    const result = await service.prepare(input);

    expect(result.reused).toBe(true);
    expect(result.id).toBe(existing.id);
    expect(repo.save).not.toHaveBeenCalled();
    expect(reports.createUniformFile).toHaveBeenCalledWith(
      'effective-owner',
      '2026-02-01',
      '2026-03-31',
      '222222226',
      expect.objectContaining({ generatedAt: existing.generatedAt }),
    );
  });

  it('creates a new version when regenerated source bytes changed', async () => {
    const { service, repo, reports } = setup();
    const existing = entity();
    repo.findOne.mockResolvedValue(existing);
    reports.createUniformFile
      .mockResolvedValueOnce(artifacts('changed-old-context', 'bkm'))
      .mockResolvedValueOnce(artifacts('changed-new-context', 'bkm'));

    const result = await service.prepare(input);

    expect(result.reused).toBe(false);
    expect(reports.createUniformFile).toHaveBeenCalledTimes(2);
    expect(repo.create.mock.calls[0][0].generatedAt.getTime())
      .toBeGreaterThan(existing.generatedAt.getTime());
  });

  it('returns the concurrently inserted identical artifact after a duplicate key', async () => {
    const { service, repo } = setup();
    const concurrent = entity({ id: 42 });
    repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrent);
    repo.save.mockRejectedValue({ code: 'ER_DUP_ENTRY', errno: 1062 });

    await expect(service.prepare(input)).resolves.toEqual(
      expect.objectContaining({ id: 42, reused: true }),
    );
  });

  it('does not persist when generation fails', async () => {
    const { service, repo, reports } = setup();
    repo.findOne.mockResolvedValue(null);
    reports.createUniformFile.mockRejectedValue(new Error('validation failed'));

    await expect(service.prepare(input)).rejects.toThrow('validation failed');
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid or reversed period before generation', async () => {
    const { service, repo, reports } = setup();

    await expect(service.prepare({
      ...input,
      periodStart: '2026-02-30',
    })).rejects.toThrow('YYYY-MM-DD');
    await expect(service.prepare({
      ...input,
      periodStart: '2026-04-01',
      periodEnd: '2026-03-31',
    })).rejects.toThrow('Invalid uniform-file period');

    expect(reports.createUniformFile).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('scopes status reads to the authorized business', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(entity());

    await service.status(7, 31);

    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 31, businessId: 7 } });
  });

  it('does not reveal another business submission', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    await expect(service.status(8, 31)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('regenerates, reserves once, uploads both files and persists approval', async () => {
    const { service, repo, uploads } = setup();
    repo.findOne.mockResolvedValue(entity());
    uploads.reserveUploadLinks.mockResolvedValue({
      uniqueId: 'pair-id',
      ini: { kind: 'INI', fileName: 'INI.TXT', fileUniqueId: 'ini-id' },
      bkm: { kind: 'BKM', fileName: 'BKMVDATA.TXT', fileUniqueId: 'bkm-id' },
    });
    uploads.uploadFile.mockResolvedValue(undefined);
    uploads.getFileStatuses.mockResolvedValue([
      { fileName: 'ini-id', status: 'Approved', isFound: true },
      { fileName: 'bkm-id', status: 'Approved', isFound: true },
    ]);

    const result = await service.transfer(7, 31, 'effective-owner', 'daily-token');

    expect(result.state).toBe(UniformFileSubmissionState.APPROVED);
    expect(uploads.reserveUploadLinks).toHaveBeenCalledTimes(1);
    expect(uploads.uploadFile).toHaveBeenCalledTimes(2);
    expect(uploads.getFileStatuses).toHaveBeenCalledWith('daily-token', [
      'ini-id',
      'bkm-id',
    ]);
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('polls persisted identifiers without reserving replacement links', async () => {
    const { service, repo, uploads } = setup();
    repo.findOne.mockResolvedValue(entity({
      state: UniformFileSubmissionState.UNKNOWN_OUTCOME,
      shaamUniqueId: 'pair-id',
      iniFileUniqueId: 'ini-id',
      bkmFileUniqueId: 'bkm-id',
    }));
    uploads.getFileStatuses.mockResolvedValue([
      { fileName: 'ini-id', status: 'Uploaded', isFound: true },
      { fileName: 'bkm-id', status: '', isFound: false },
    ]);

    const result = await service.transfer(7, 31, 'effective-owner', 'daily-token');

    expect(result.state).toBe(UniformFileSubmissionState.PROCESSING);
    expect(uploads.reserveUploadLinks).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('fails closed when regenerated bytes differ from the prepared artifact', async () => {
    const { service, repo, reports, uploads } = setup();
    repo.findOne.mockResolvedValue(entity());
    reports.createUniformFile.mockResolvedValue(artifacts('changed', 'bkm'));

    await expect(
      service.transfer(7, 31, 'effective-owner', 'daily-token'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(uploads.reserveUploadLinks).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('persists UNKNOWN_OUTCOME after an ambiguous partial upload', async () => {
    const { service, repo, uploads } = setup();
    repo.findOne.mockResolvedValue(entity());
    uploads.reserveUploadLinks.mockResolvedValue({
      uniqueId: 'pair-id',
      ini: { kind: 'INI', fileName: 'INI.TXT', fileUniqueId: 'ini-id' },
      bkm: { kind: 'BKM', fileName: 'BKMVDATA.TXT', fileUniqueId: 'bkm-id' },
    });
    uploads.uploadFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ServiceUnavailableException('ambiguous'));

    await expect(
      service.transfer(7, 31, 'effective-owner', 'daily-token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      state: UniformFileSubmissionState.UNKNOWN_OUTCOME,
      errorCode: 'AMBIGUOUS_EXTERNAL_OUTCOME',
      iniFileUniqueId: 'ini-id',
      bkmFileUniqueId: 'bkm-id',
    }));
  });

  it('does not reserve links when another request already claimed the submission', async () => {
    const { service, repo, uploads } = setup();
    repo.findOne.mockResolvedValue(entity());
    repo.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.transfer(7, 31, 'effective-owner', 'daily-token'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(uploads.reserveUploadLinks).not.toHaveBeenCalled();
  });

  it('returns a terminal approval without another external poll', async () => {
    const { service, repo, uploads } = setup();
    repo.findOne.mockResolvedValue(entity({
      state: UniformFileSubmissionState.APPROVED,
      iniStatus: UniformFileRemoteStatus.APPROVED,
      bkmStatus: UniformFileRemoteStatus.APPROVED,
      iniFileUniqueId: 'ini-id',
      bkmFileUniqueId: 'bkm-id',
    }));

    const result = await service.poll(7, 31, 'daily-token');

    expect(result.state).toBe(UniformFileSubmissionState.APPROVED);
    expect(uploads.getFileStatuses).not.toHaveBeenCalled();
  });
});
