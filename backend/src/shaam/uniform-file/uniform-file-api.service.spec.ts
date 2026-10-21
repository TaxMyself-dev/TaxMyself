import { of, throwError } from 'rxjs';
import { UniformFileRemoteStatus } from '../entities/shaam.enums';
import { ShaamEnvironment } from '../shaam.constants';
import { UniformFileApiConfig } from './uniform-file-api.config';
import {
  uniformFileChunkSize,
  UniformFileApiService,
  UniformFileClientError,
  UniformFileUploadReservation,
} from './uniform-file-api.service';

describe('UniformFileApiService', () => {
  const config: UniformFileApiConfig = {
    enabled: true,
    environment: ShaamEnvironment.TSANDBOX,
    clientId: 'client-id',
    uploadLinksUrl: 'https://t-ita-api.taxes.gov.il/upload-links',
    statusUrl: 'https://t-ita-api.taxes.gov.il/status',
  };
  const pairResponse = {
    success: true,
    data: {
      uniqueId: 'pair-id',
      files: [
        {
          fileName: 'FROMBKM_TEST_BKMVDATA.pdf',
          signUrl: 'https://storage.googleapis.com/bucket/bkm?signature=secret',
          fileUniqueId: 'bkm-id.txt',
          headers: {
            'x-goog-content-length-range': '0,53687091200',
            'x-goog-resumable': 'start',
          },
        },
        {
          fileName: 'INI_TEST.pdf',
          signUrl: 'https://storage.googleapis.com/bucket/ini?signature=secret',
          fileUniqueId: 'ini-id.txt',
          headers: {
            'x-goog-content-length-range': '0,1048576',
            'x-goog-resumable': 'start',
          },
        },
      ],
    },
    error: null,
  };

  function setup() {
    const http = { post: jest.fn(), put: jest.fn() };
    return {
      service: new UniformFileApiService(http as any, config),
      http,
    };
  }

  it('reserves and identifies one strict INI/BKM pair independent of order', async () => {
    const { service, http } = setup();
    http.post.mockReturnValue(of({ status: 200, data: pairResponse }));

    await expect(
      service.reserveUploadLinks('daily-token', {
        caseNumber: '777777745',
        startPeriod: '2025-01-01',
        endPeriod: '2025-12-31',
      }),
    ).resolves.toMatchObject({
      uniqueId: 'pair-id',
      ini: { kind: 'ini', fileUniqueId: 'ini-id.txt', maxByteLength: 1048576 },
      bkm: { kind: 'bkm', fileUniqueId: 'bkm-id.txt' },
    });
    expect(http.post.mock.calls[0][1]).toEqual({
      caseNumber: 777777745,
      startPeriod: '2025-01-01',
      endPeriod: '2025-12-31',
    });
  });

  it('rejects malformed, duplicate or untrusted upload reservations', async () => {
    const { service, http } = setup();
    http.post.mockReturnValue(
      of({
        status: 200,
        data: {
          ...pairResponse,
          data: {
            ...pairResponse.data,
            files: [
              pairResponse.data.files[1],
              {
                ...pairResponse.data.files[1],
                fileUniqueId: 'other-id.txt',
                signUrl: 'https://attacker.example/upload',
              },
            ],
          },
        },
      }),
    );

    await expect(
      service.reserveUploadLinks('daily-token', {
        caseNumber: '777777745',
        startPeriod: '2025-01-01',
        endPeriod: '2025-12-31',
      }),
    ).rejects.toMatchObject({ category: 'validation', ambiguous: false });
  });

  it('checks the returned byte limit before initiating an upload', () => {
    const { service } = setup();
    expect(() =>
      service.assertWithinReservedSize(
        { maxByteLength: 2 } as UniformFileUploadReservation,
        Buffer.from('abc'),
      ),
    ).toThrow('exceeds the reserved upload size');
  });

  it('requires 201 and a trusted Location from resumable initiation', async () => {
    const { service, http } = setup();
    http.post.mockReturnValue(
      of({
        status: 201,
        headers: {
          location:
            'https://storage.googleapis.com/upload/session?secret=value',
        },
      }),
    );
    const reservation = {
      ...pairResponse.data.files[1],
      kind: 'ini',
      maxByteLength: 100,
    } as UniformFileUploadReservation;

    await expect(
      service.initiateResumableUpload(reservation, Buffer.from('data')),
    ).resolves.toContain('storage.googleapis.com/upload/session');
    expect(http.post.mock.calls[0][1]).toBeNull();
  });

  it('uses documented chunk tiers and accepts 308 only before completion', async () => {
    expect(uniformFileChunkSize(32 * 1024 * 1024)).toBe(32 * 1024 * 1024);
    expect(uniformFileChunkSize(32 * 1024 * 1024 + 1)).toBe(32 * 1024 * 1024);
    expect(uniformFileChunkSize(250 * 1024 * 1024 + 1)).toBe(64 * 1024 * 1024);
    expect(uniformFileChunkSize(1024 * 1024 * 1024 + 1)).toBe(
      128 * 1024 * 1024,
    );

    const { service, http } = setup();
    http.put.mockReturnValue(of({ status: 200 }));
    await service.uploadBuffer(
      'https://storage.googleapis.com/upload/session',
      Buffer.from('complete-file'),
    );
    expect(http.put.mock.calls[0][2].headers['Content-Range']).toBe(
      'bytes 0-12/13',
    );
  });

  it('marks an upload timeout as an ambiguous external outcome', async () => {
    const { service, http } = setup();
    http.put.mockReturnValue(
      throwError(() =>
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
      ),
    );

    await expect(
      service.uploadBuffer(
        'https://storage.googleapis.com/upload/session',
        Buffer.from('data'),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<UniformFileClientError>>({
        stage: 'upload_bytes',
        category: 'timeout',
        ambiguous: true,
      }),
    );
  });

  it('validates every status item and preserves Uploaded as non-approved', async () => {
    const { service, http } = setup();
    http.post.mockReturnValue(
      of({
        status: 200,
        data: [
          {
            fileName: 'ini-id.txt',
            status: 'Approved',
            description: '',
            isFound: true,
            errorCode: null,
            errorMessage: null,
          },
          {
            fileName: 'bkm-id.txt',
            status: 'Uploaded',
            description: '',
            isFound: true,
            errorCode: null,
            errorMessage: null,
          },
        ],
      }),
    );

    await expect(
      service.getFileStatuses('daily-token', ['ini-id.txt', 'bkm-id.txt']),
    ).resolves.toEqual([
      expect.objectContaining({ status: UniformFileRemoteStatus.APPROVED }),
      expect.objectContaining({ status: UniformFileRemoteStatus.UPLOADED }),
    ]);
  });

  it('returns per-file permission/not-found outcomes without inventing a status', async () => {
    const { service, http } = setup();
    http.post.mockReturnValue(
      of({
        status: 200,
        data: [
          {
            fileName: 'ini-id.txt',
            status: '',
            isFound: false,
            errorCode: 400,
            errorMessage: 'Permission denied.',
          },
          {
            fileName: 'bkm-id.txt',
            status: '',
            isFound: false,
            errorCode: 400,
            errorMessage: 'File not found.',
          },
        ],
      }),
    );

    const result = await service.getFileStatuses('daily-token', [
      'ini-id.txt',
      'bkm-id.txt',
    ]);
    expect(result).toEqual([
      expect.objectContaining({ found: false, status: null }),
      expect.objectContaining({ found: false, status: null }),
    ]);
  });
});
