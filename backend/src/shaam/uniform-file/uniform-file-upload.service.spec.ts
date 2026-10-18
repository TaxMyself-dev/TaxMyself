import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ShaamEnvironment } from '../shaam.constants';
import { UniformFileOauthConfig } from './uniform-file-oauth.config';
import { UniformFileUploadService } from './uniform-file-upload.service';

describe('UniformFileUploadService', () => {
  const config: UniformFileOauthConfig = {
    enabled: true,
    environment: ShaamEnvironment.TSANDBOX,
    clientId: 'uniform-client',
    clientSecret: 'uniform-secret',
    redirectUri: 'http://localhost:3000/shaam/uniform-file/oauth/callback',
    authorizeUrl: 'https://openapi.taxes.gov.il/shaam/tsandbox/authorize',
    tokenUrl: 'https://openapi.taxes.gov.il/shaam/tsandbox/token',
    uploadLinksUrl:
      'https://ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
    statusUrl:
      'https://ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status',
    sandboxCaseNumberOverride: null,
    scopes: ['UniStructFileUploadLinks_scope', 'FilesStatus_scope'],
  };

  const storageHeaders = {
    'x-goog-content-length-range': '1,2000000000',
    'x-goog-resumable': 'start',
  };

  const reservationBody = {
    success: true,
    data: {
      uniqueId: 'pair-123',
      files: [
        {
          fileName: 'BKMVDATA.TXT',
          signUrl: 'https://storage.googleapis.com/bucket/bkm?signed=1',
          fileUniqueId: 'bkm-id',
          headers: storageHeaders,
        },
        {
          fileName: 'INI.TXT',
          signUrl: 'https://storage.googleapis.com/bucket/ini?signed=1',
          fileUniqueId: 'ini-id',
          headers: storageHeaders,
        },
      ],
    },
  };

  function setup() {
    const httpService = {
      post: jest.fn(),
      put: jest.fn(),
    };
    return {
      service: new UniformFileUploadService(httpService as any, config),
      httpService,
    };
  }

  it('reserves and classifies the INI/BKM links by name instead of array order', async () => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(of({ status: 200, data: reservationBody }));

    await expect(
      service.reserveUploadLinks('daily-token', {
        caseNumber: '123456789',
        startPeriod: '2026-01-01',
        endPeriod: '2026-12-31',
      }),
    ).resolves.toMatchObject({
      uniqueId: 'pair-123',
      ini: { kind: 'INI', fileName: 'INI.TXT', fileUniqueId: 'ini-id' },
      bkm: { kind: 'BKM', fileName: 'BKMVDATA.TXT', fileUniqueId: 'bkm-id' },
    });

    const [url, body, options] = httpService.post.mock.calls[0];
    expect(url).toBe(config.uploadLinksUrl);
    expect(body).toEqual({
      caseNumber: 123456789,
      startPeriod: '2026-01-01',
      endPeriod: '2026-12-31',
    });
    expect(options.headers.Authorization).toBe('Bearer daily-token');
  });

  it('uses the configured sandbox case number only for the external reservation', async () => {
    const httpService = {
      post: jest.fn().mockReturnValue(of({ status: 200, data: reservationBody })),
      put: jest.fn(),
    };
    const service = new UniformFileUploadService(httpService as any, {
      ...config,
      sandboxCaseNumberOverride: '777777723',
    });

    await service.reserveUploadLinks('daily-token', {
      caseNumber: '222222226',
      startPeriod: '2026-02-01',
      endPeriod: '2026-03-31',
    });

    expect(httpService.post.mock.calls[0][1]).toEqual({
      caseNumber: 777777723,
      startPeriod: '2026-02-01',
      endPeriod: '2026-03-31',
    });
  });

  it('never applies a sandbox case-number override in production', async () => {
    const httpService = {
      post: jest.fn().mockReturnValue(of({ status: 200, data: reservationBody })),
      put: jest.fn(),
    };
    const service = new UniformFileUploadService(httpService as any, {
      ...config,
      environment: ShaamEnvironment.PRODUCTION,
      sandboxCaseNumberOverride: '777777723',
    });

    await service.reserveUploadLinks('daily-token', {
      caseNumber: '222222226',
      startPeriod: '2026-02-01',
      endPeriod: '2026-03-31',
    });

    expect(httpService.post.mock.calls[0][1].caseNumber).toBe(222222226);
  });

  it('reports a successful HTTP response with success false as a rejected reservation', async () => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(of({
      status: 200,
      data: {
        success: false,
        data: null,
        error: { errorCode: 400, message: 'upstream detail' },
      },
    }));

    await expect(service.reserveUploadLinks('daily-token', {
      caseNumber: '222222226',
      startPeriod: '2026-02-01',
      endPeriod: '2026-03-31',
    })).rejects.toEqual(
      new BadRequestException('SHAAM rejected the upload-link reservation'),
    );
  });

  it.each([
    {
      ...reservationBody,
      data: {
        ...reservationBody.data,
        files: [reservationBody.data.files[0], reservationBody.data.files[0]],
      },
    },
    {
      ...reservationBody,
      data: {
        ...reservationBody.data,
        files: reservationBody.data.files.map((file) => ({
          ...file,
          signUrl: 'https://attacker.example/upload',
        })),
      },
    },
    {
      ...reservationBody,
      data: {
        ...reservationBody.data,
        files: reservationBody.data.files.map((file) => ({
          ...file,
          headers: { ...storageHeaders, Authorization: 'unsafe' },
        })),
      },
    },
  ])('rejects malformed or unsafe upload-link metadata', async (data) => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(of({ status: 200, data }));

    await expect(
      service.reserveUploadLinks('daily-token', {
        caseNumber: '123456789',
        startPeriod: '2026-01-01',
        endPeriod: '2026-12-31',
      }),
    ).rejects.toThrow(BadGatewayException);
  });

  it('rejects a file outside the size reserved by SHAAM before storage calls', async () => {
    const { service, httpService } = setup();
    const link = {
      kind: 'INI' as const,
      fileName: 'INI.TXT',
      fileUniqueId: 'ini-id',
      signUrl: 'https://storage.googleapis.com/bucket/ini?signed=1',
      headers: {
        ...storageHeaders,
        'x-goog-content-length-range': '10,20',
      },
      minimumBytes: 10,
      maximumBytes: 20,
    };

    await expect(service.uploadFile(link, Buffer.from('small'))).rejects.toThrow(
      BadRequestException,
    );
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('initiates and uploads a small file in one final request', async () => {
    const { service, httpService } = setup();
    const contents = Buffer.from('uniform-file');
    const link = {
      kind: 'INI' as const,
      fileName: 'INI.TXT',
      fileUniqueId: 'ini-id',
      signUrl: 'https://storage.googleapis.com/bucket/ini?signed=1',
      headers: {
        ...storageHeaders,
        'x-goog-content-length-range': '1,100',
      },
      minimumBytes: 1,
      maximumBytes: 100,
    };
    httpService.post.mockReturnValue(
      of({
        status: 201,
        headers: { location: 'https://storage.googleapis.com/session/ini' },
      }),
    );
    httpService.put.mockReturnValue(of({ status: 200 }));

    await expect(service.uploadFile(link, contents)).resolves.toBeUndefined();
    expect(httpService.post).toHaveBeenCalledWith(
      link.signUrl,
      expect.any(Buffer),
      expect.objectContaining({ headers: expect.objectContaining(link.headers) }),
    );
    expect(httpService.put).toHaveBeenCalledWith(
      'https://storage.googleapis.com/session/ini',
      contents,
      expect.objectContaining({
        headers: {
          'Content-Length': String(contents.length),
          'Content-Range': `bytes 0-${contents.length - 1}/${contents.length}`,
        },
      }),
    );
  });

  it('uses 32 MiB chunks and requires 308 before the final chunk', async () => {
    const { service, httpService } = setup();
    const contents = Buffer.alloc(32 * 1024 * 1024 + 1);
    const link = {
      kind: 'BKM' as const,
      fileName: 'BKMVDATA.TXT',
      fileUniqueId: 'bkm-id',
      signUrl: 'https://storage.googleapis.com/bucket/bkm?signed=1',
      headers: {
        ...storageHeaders,
        'x-goog-content-length-range': `1,${contents.length}`,
      },
      minimumBytes: 1,
      maximumBytes: contents.length,
    };
    httpService.post.mockReturnValue(
      of({
        status: 201,
        headers: { Location: 'https://storage.googleapis.com/session/bkm' },
      }),
    );
    httpService.put
      .mockReturnValueOnce(of({ status: 308 }))
      .mockReturnValueOnce(of({ status: 201 }));

    await service.uploadFile(link, contents);

    expect(httpService.put).toHaveBeenCalledTimes(2);
    expect(httpService.put.mock.calls[0][2].headers['Content-Range']).toBe(
      `bytes 0-${32 * 1024 * 1024 - 1}/${contents.length}`,
    );
    expect(httpService.put.mock.calls[1][2].headers['Content-Range']).toBe(
      `bytes ${32 * 1024 * 1024}-${contents.length - 1}/${contents.length}`,
    );
  });

  it('rejects a non-308 intermediate chunk response', async () => {
    const { service, httpService } = setup();
    const contents = Buffer.alloc(32 * 1024 * 1024 + 1);
    httpService.post.mockReturnValue(
      of({
        status: 201,
        headers: { location: 'https://storage.googleapis.com/session/bkm' },
      }),
    );
    httpService.put.mockReturnValue(of({ status: 200 }));

    await expect(
      service.uploadFile(
        {
          kind: 'BKM',
          fileName: 'BKMVDATA.TXT',
          fileUniqueId: 'bkm-id',
          signUrl: 'https://storage.googleapis.com/bucket/bkm?signed=1',
          headers: {
            ...storageHeaders,
            'x-goog-content-length-range': `1,${contents.length}`,
          },
          minimumBytes: 1,
          maximumBytes: contents.length,
        },
        contents,
      ),
    ).rejects.toThrow(BadGatewayException);
  });

  it('reports a partial pair when the second resumable upload cannot start', async () => {
    const { service, httpService } = setup();
    const parsed = await (() => {
      httpService.post.mockReturnValue(of({ status: 200, data: reservationBody }));
      return service.reserveUploadLinks('daily-token', {
        caseNumber: '123456789',
        startPeriod: '2026-01-01',
        endPeriod: '2026-12-31',
      });
    })();
    httpService.post.mockReset();
    httpService.post
      .mockReturnValueOnce(
        of({
          status: 201,
          headers: { location: 'https://storage.googleapis.com/session/ini' },
        }),
      )
      .mockReturnValueOnce(of({ status: 500, headers: {} }));
    httpService.put.mockReturnValue(of({ status: 200 }));

    await expect(
      service.uploadPair(parsed, {
        ini: Buffer.from('ini'),
        bkm: Buffer.from('bkm'),
      }),
    ).rejects.toThrow(BadGatewayException);
    expect(httpService.put).toHaveBeenCalledTimes(1);
    expect(httpService.post).toHaveBeenCalledTimes(2);
  });

  it('returns mixed status results without treating Uploaded as Approved', async () => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(
      of({
        status: 200,
        data: [
          {
            fileName: 'ini-id',
            status: 'Uploaded',
            description: 'received',
            isFound: true,
          },
          {
            fileName: 'bkm-id',
            status: '',
            isFound: false,
            errorCode: '404',
            errorMessage: 'not found yet',
          },
        ],
      }),
    );

    await expect(
      service.getFileStatuses('daily-token', ['ini-id', 'bkm-id']),
    ).resolves.toEqual([
      {
        fileName: 'ini-id',
        status: 'Uploaded',
        description: 'received',
        isFound: true,
        errorCode: '',
        errorMessage: '',
      },
      {
        fileName: 'bkm-id',
        status: '',
        description: '',
        isFound: false,
        errorCode: '404',
        errorMessage: 'not found yet',
      },
    ]);
  });

  it('rejects missing or duplicate status results', async () => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(
      of({
        status: 200,
        data: [
          { fileName: 'ini-id', status: 'Approved', isFound: true },
          { fileName: 'ini-id', status: 'Approved', isFound: true },
        ],
      }),
    );

    await expect(
      service.getFileStatuses('daily-token', ['ini-id', 'bkm-id']),
    ).rejects.toThrow(BadGatewayException);
  });

  it('does not leak an upstream error body', async () => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(
      throwError(() => ({
        response: { status: 500, data: { token: 'sensitive-upstream-value' } },
      })),
    );

    await expect(
      service.getFileStatuses('daily-token', ['ini-id']),
    ).rejects.toEqual(new BadGatewayException('SHAAM failed to read file status'));
  });

  it.each([
    [401, UnauthorizedException],
    [406, ForbiddenException],
  ])('normalizes SHAAM authorization response %s', async (status, errorType) => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(
      of({ status, data: { signedUrl: 'must-not-escape' } }),
    );

    await expect(
      service.reserveUploadLinks('daily-token', {
        caseNumber: '123456789',
        startPeriod: '2026-01-01',
        endPeriod: '2026-12-31',
      }),
    ).rejects.toThrow(errorType);
  });

  it('normalizes a timeout without exposing request capability data', async () => {
    const { service, httpService } = setup();
    httpService.post.mockReturnValue(
      throwError(() => new Error('timeout for https://storage.googleapis.com/signed')),
    );

    await expect(
      service.getFileStatuses('daily-token', ['ini-id']),
    ).rejects.toEqual(
      new ServiceUnavailableException('SHAAM is temporarily unavailable'),
    );
  });

  it('makes no external call when the feature is disabled', async () => {
    const httpService = { post: jest.fn(), put: jest.fn() };
    const service = new UniformFileUploadService(httpService as any, {
      ...config,
      enabled: false,
    });

    await expect(
      service.getFileStatuses('daily-token', ['ini-id']),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(httpService.post).not.toHaveBeenCalled();
  });
});
