import { ShaamEnvironment } from '../shaam.constants';
import {
  UniformFileRemoteStatus,
  UniformFileSubmissionState,
} from '../entities/shaam.enums';
import { UniformFileClientError } from '../uniform-file/uniform-file-api.service';
import { UniformFileSubmissionService } from './uniform-file-submission.service';

describe('UniformFileSubmissionService', () => {
  const business = { id: 7, businessNumber: '777777745' } as any;
  const artifacts = {
    iniBuffer: Buffer.from('ini-data'),
    bkmvdataBuffer: Buffer.from('bkm-data'),
    zipBuffer: Buffer.from('zip'),
    filePath: 'OPENFRMT/path',
    document_summary: [],
    list_summary: [],
  };
  const pair = {
    uniqueId: 'pair-secret-id',
    ini: {
      kind: 'ini',
      fileName: 'INI_TEST.txt',
      fileUniqueId: 'ini-id.txt',
      signUrl: 'https://storage.googleapis.com/bucket/ini?secret=value',
      headers: {
        'x-goog-content-length-range': '0,1000',
        'x-goog-resumable': 'start',
      },
      maxByteLength: 1000,
    },
    bkm: {
      kind: 'bkm',
      fileName: 'FROMBKM_TEST.txt',
      fileUniqueId: 'bkm-id.txt',
      signUrl: 'https://storage.googleapis.com/bucket/bkm?secret=value',
      headers: {
        'x-goog-content-length-range': '0,1000',
        'x-goog-resumable': 'start',
      },
      maxByteLength: 1000,
    },
  } as any;

  function setup() {
    const rows: any[] = [];
    const repo = {
      findOne: jest.fn(async ({ where }: any) =>
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ),
      ),
      create: jest.fn((value) => ({
        id: 1,
        iniStatus: null,
        bkmStatus: null,
        shaamUniqueId: null,
        iniFileName: null,
        bkmFileName: null,
        iniFileUniqueId: null,
        bkmFileUniqueId: null,
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
        retryCount: 0,
        uploadedAt: null,
        lastPolledAt: null,
        completedAt: null,
        ...value,
      })),
      save: jest.fn(async (value) => {
        const existing = rows.find((row) => row.id === value.id);
        if (existing) Object.assign(existing, value);
        else rows.push(value);
        return value;
      }),
      update: jest.fn(async (criteria, patch) => {
        const row = rows.find((candidate) =>
          Object.entries(criteria).every(
            ([key, value]) => candidate[key] === value,
          ),
        );
        if (!row) return { affected: 0 };
        Object.assign(row, patch);
        return { affected: 1 };
      }),
    };
    const reports = {
      createUniformFile: jest.fn().mockResolvedValue(artifacts),
    };
    const connections = {
      getValidAccessToken: jest.fn().mockResolvedValue('daily-token'),
      markReauthorizationRequired: jest.fn().mockResolvedValue(undefined),
    };
    const api = {
      reserveUploadLinks: jest.fn().mockResolvedValue(pair),
      assertWithinReservedSize: jest.fn(),
      initiateResumableUpload: jest
        .fn()
        .mockResolvedValueOnce('https://storage.googleapis.com/session/ini')
        .mockResolvedValueOnce('https://storage.googleapis.com/session/bkm'),
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
      getFileStatuses: jest.fn().mockResolvedValue([
        {
          fileUniqueId: 'ini-id.txt',
          found: true,
          status: UniformFileRemoteStatus.UPLOADED,
          description: null,
          errorCode: null,
          errorMessage: null,
        },
        {
          fileUniqueId: 'bkm-id.txt',
          found: true,
          status: UniformFileRemoteStatus.UPLOADED,
          description: null,
          errorCode: null,
          errorMessage: null,
        },
      ]),
    };
    const service = new UniformFileSubmissionService(
      repo as any,
      reports as any,
      connections as any,
      api as any,
      { environment: ShaamEnvironment.TSANDBOX } as any,
    );
    return { service, repo, reports, connections, api, rows };
  }

  it('persists each boundary and exposes only safe pair-level state', async () => {
    const { service, repo, api } = setup();

    const result = await service.submit(
      'owner',
      'actor',
      business,
      '2025-01-01',
      '2025-12-31',
    );

    expect(result.state).toBe(UniformFileSubmissionState.PROCESSING);
    expect(result.iniStatus).toBe(UniformFileRemoteStatus.UPLOADED);
    expect(result.bkmStatus).toBe(UniformFileRemoteStatus.UPLOADED);
    expect(api.reserveUploadLinks).toHaveBeenCalledTimes(1);
    expect(api.initiateResumableUpload).toHaveBeenCalledTimes(2);
    expect(api.uploadBuffer).toHaveBeenCalledTimes(2);
    expect(repo.save.mock.calls.length).toBeGreaterThanOrEqual(7);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('daily-token');
    expect(serialized).not.toContain('storage.googleapis.com');
    expect(serialized).not.toContain('ini-id.txt');
    expect(serialized).not.toContain('pair-secret-id');
  });

  it('persists AUTH_REQUIRED before making any external API request', async () => {
    const { service, connections, api } = setup();
    connections.getValidAccessToken.mockResolvedValue(null);

    const result = await service.submit(
      'owner',
      'actor',
      business,
      '2025-01-01',
      '2025-12-31',
    );

    expect(result.state).toBe(UniformFileSubmissionState.AUTH_REQUIRED);
    expect(api.reserveUploadLinks).not.toHaveBeenCalled();
  });

  it('clears the saved Daily Token after an upstream authorization rejection', async () => {
    const { service, connections, api } = setup();
    api.reserveUploadLinks.mockRejectedValue(
      new UniformFileClientError(
        'SHAAM Uniform File request failed',
        'reserve_links',
        'authorization',
        false,
        406,
      ),
    );

    const result = await service.submit(
      'owner',
      'owner',
      business,
      '2025-01-01',
      '2025-12-31',
    );

    expect(result.state).toBe(UniformFileSubmissionState.AUTH_REQUIRED);
    expect(connections.markReauthorizationRequired).toHaveBeenCalledWith(
      7,
      'UNIFORM_FILE',
      ShaamEnvironment.TSANDBOX,
    );
  });

  it('does not reserve a second pair after an ambiguous reservation outcome', async () => {
    const { service, api } = setup();
    api.reserveUploadLinks.mockRejectedValue(
      new UniformFileClientError(
        'SHAAM Uniform File request timed out',
        'reserve_links',
        'timeout',
        true,
      ),
    );

    const first = await service.submit(
      'owner',
      'actor',
      business,
      '2025-01-01',
      '2025-12-31',
    );
    const second = await service.submit(
      'owner',
      'actor',
      business,
      '2025-01-01',
      '2025-12-31',
    );

    expect(first.state).toBe(UniformFileSubmissionState.UNKNOWN_OUTCOME);
    expect(second.state).toBe(UniformFileSubmissionState.UNKNOWN_OUTCOME);
    expect(api.reserveUploadLinks).toHaveBeenCalledTimes(1);
  });

  it('reconciles a restart-safe unknown outcome through saved file IDs', async () => {
    const { service, api, rows } = setup();
    rows.push({
      id: 3,
      businessId: 7,
      environment: ShaamEnvironment.TSANDBOX,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      state: UniformFileSubmissionState.UNKNOWN_OUTCOME,
      iniFileUniqueId: 'ini-id.txt',
      bkmFileUniqueId: 'bkm-id.txt',
      iniStatus: null,
      bkmStatus: null,
      errorCategory: 'bkm_upload_in_progress',
      errorCode: null,
      errorMessage: null,
      generatedAt: new Date(),
      uploadedAt: null,
      lastPolledAt: null,
      completedAt: null,
    });
    api.getFileStatuses.mockResolvedValue([
      {
        fileUniqueId: 'ini-id.txt',
        found: true,
        status: UniformFileRemoteStatus.APPROVED,
      },
      {
        fileUniqueId: 'bkm-id.txt',
        found: true,
        status: UniformFileRemoteStatus.APPROVED,
      },
    ]);

    const result = await service.poll(3, 7);

    expect(result.state).toBe(UniformFileSubmissionState.APPROVED);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('requires both files to be approved and preserves a partial pair', async () => {
    const { service, api } = setup();
    api.getFileStatuses.mockResolvedValue([
      {
        fileUniqueId: 'ini-id.txt',
        found: true,
        status: UniformFileRemoteStatus.APPROVED,
      },
      {
        fileUniqueId: 'bkm-id.txt',
        found: true,
        status: UniformFileRemoteStatus.UPLOADED,
      },
    ]);

    const result = await service.submit(
      'owner',
      'actor',
      business,
      '2025-01-01',
      '2025-12-31',
    );

    expect(result.state).toBe(UniformFileSubmissionState.PROCESSING);
    expect(result.iniStatus).toBe(UniformFileRemoteStatus.APPROVED);
    expect(result.bkmStatus).toBe(UniformFileRemoteStatus.UPLOADED);
  });

  it('rejects the pair when either file is rejected', async () => {
    const { service, api } = setup();
    api.getFileStatuses.mockResolvedValue([
      {
        fileUniqueId: 'ini-id.txt',
        found: true,
        status: UniformFileRemoteStatus.APPROVED,
      },
      {
        fileUniqueId: 'bkm-id.txt',
        found: true,
        status: UniformFileRemoteStatus.REJECTED,
        description: 'Synthetic rejection',
      },
    ]);

    const result = await service.submit(
      'owner',
      'actor',
      business,
      '2025-01-01',
      '2025-12-31',
    );

    expect(result.state).toBe(UniformFileSubmissionState.REJECTED);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.errorCategory).toBe('provider_rejected');
  });

  it('does not call SHAAM when another worker wins the reservation claim', async () => {
    const { service, repo, api, rows } = setup();
    rows.push({
      id: 4,
      businessId: 7,
      environment: ShaamEnvironment.TSANDBOX,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      state: UniformFileSubmissionState.GENERATED,
      shaamUniqueId: null,
      iniFileUniqueId: null,
      bkmFileUniqueId: null,
      iniStatus: null,
      bkmStatus: null,
      errorCategory: null,
      errorCode: null,
      errorMessage: null,
      generatedAt: new Date(),
      uploadedAt: null,
      lastPolledAt: null,
      completedAt: null,
    });
    repo.update.mockResolvedValueOnce({ affected: 0 });

    const result = await service.submit(
      'owner',
      'actor',
      business,
      '2025-01-01',
      '2025-12-31',
    );

    expect(result.id).toBe(4);
    expect(api.reserveUploadLinks).not.toHaveBeenCalled();
  });
});
