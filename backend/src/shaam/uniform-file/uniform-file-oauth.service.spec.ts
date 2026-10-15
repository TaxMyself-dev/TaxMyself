import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ShaamEnvironment } from '../shaam.constants';
import { UniformFileOauthConfig } from './uniform-file-oauth.config';
import { UniformFileOauthService } from './uniform-file-oauth.service';

describe('UniformFileOauthService', () => {
  const config: UniformFileOauthConfig = {
    enabled: true,
    environment: ShaamEnvironment.TSANDBOX,
    clientId: 'uniform-client',
    clientSecret: 'uniform-secret',
    redirectUri: 'http://localhost:3000/shaam/uniform-file/oauth/callback',
    authorizeUrl: 'https://openapi.taxes.gov.il/authorize',
    tokenUrl: 'https://openapi.taxes.gov.il/token',
    uploadLinksUrl: 'https://ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
    statusUrl: 'https://ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status',
    stateSecret: 's'.repeat(32),
    scopes: ['UniStructFileUploadLinksApi', 'FilesStatusApi'],
  };

  function setup(response?: unknown) {
    const httpService = {
      post: jest.fn().mockReturnValue(
        of({
          status: 200,
          data:
            response ??
            ({
              access_token: 'daily-token',
              token_type: 'Bearer',
              expires_in: 43_200,
              scope: 'UniStructFileUploadLinksApi FilesStatusApi',
            } as const),
        }),
      ),
    };
    return {
      service: new UniformFileOauthService(httpService as any, config),
      httpService,
    };
  }

  it('builds an authorization URL with only the uniform-file scopes', () => {
    const { service } = setup();
    const url = new URL(service.buildAuthorizeUrl('signed-state'));

    expect(url.searchParams.get('client_id')).toBe('uniform-client');
    expect(url.searchParams.get('scope')).toBe(
      'UniStructFileUploadLinksApi FilesStatusApi',
    );
    expect(url.searchParams.get('state')).toBe('signed-state');
  });

  it('exchanges a code using fixed server-side configuration', async () => {
    const { service, httpService } = setup();

    await expect(service.exchangeCodeForDailyToken('one-time-code')).resolves.toMatchObject({
      access_token: 'daily-token',
      expires_in: 43_200,
    });
    const [url, body, options] = httpService.post.mock.calls[0];
    expect(url).toBe(config.tokenUrl);
    expect(body).toContain('code=one-time-code');
    expect(body).toContain('UniStructFileUploadLinksApi+FilesStatusApi');
    expect(options.headers.Authorization).toMatch(/^Basic /);
  });

  it('rejects an overlong or malformed Daily Token response', async () => {
    const { service } = setup({
      access_token: 'token',
      token_type: 'Bearer',
      expires_in: 43_201,
      scope: 'UniStructFileUploadLinksApi FilesStatusApi',
    });

    await expect(service.exchangeCodeForDailyToken('code')).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('does not expose the upstream OAuth error body', async () => {
    const httpService = {
      post: jest.fn().mockReturnValue(
        throwError(() => ({
          response: {
            status: 400,
            data: { error_description: 'contains-sensitive-upstream-detail' },
          },
        })),
      ),
    };
    const service = new UniformFileOauthService(httpService as any, config);

    await expect(service.exchangeCodeForDailyToken('bad-code')).rejects.toEqual(
      new BadRequestException('SHAAM rejected the authorization code'),
    );
  });

  it('fails without an external call while the feature is disabled', async () => {
    const httpService = { post: jest.fn() };
    const service = new UniformFileOauthService(httpService as any, {
      ...config,
      enabled: false,
    });

    await expect(service.exchangeCodeForDailyToken('code')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(httpService.post).not.toHaveBeenCalled();
  });
});
