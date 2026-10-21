import { of, throwError } from 'rxjs';
import {
  ShaamOauthService,
  ShaamReauthorizationRequiredError,
} from './shaam-oauth.service';

describe('ShaamOauthService token refresh classification', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SHAAM_CLIENT_ID = 'test-client';
    process.env.SHAAM_CLIENT_SECRET = 'test-secret';
    process.env.SHAAM_REDIRECT_URI = 'http://localhost:3000/shaam/oauth/callback';
    process.env.SHAAM_ENV = 'tsandbox';
    process.env.SHAAM_INVOICE_SCOPE = 'invoices_scope';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the configured scope for authorization, code exchange and refresh', async () => {
    const tokenResponse = {
      status: 200,
      data: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        scope: 'invoices_scope',
      },
    };
    const http = {
      post: jest.fn().mockReturnValue(of(tokenResponse)),
    };
    const service = new ShaamOauthService(http as any);

    const authorizeUrl = new URL(service.buildAuthorizeUrl('state'));
    expect(authorizeUrl.searchParams.get('scope')).toBe('invoices_scope');

    await service.exchangeCodeForToken(
      'authorization-code',
      'http://localhost:3000/shaam/oauth/callback',
    );
    expect(new URLSearchParams(http.post.mock.calls[0][1]).get('scope'))
      .toBe('invoices_scope');

    await service.refreshAccessToken('refresh-token');
    expect(new URLSearchParams(http.post.mock.calls[1][1]).get('scope'))
      .toBe('invoices_scope');
  });

  it('classifies an explicit invalid_grant response as requiring authorization', async () => {
    const http = {
      post: jest.fn().mockReturnValue(
        throwError(() => ({
          response: {
            status: 400,
            data: { error: 'invalid_grant' },
          },
        })),
      ),
    };
    const service = new ShaamOauthService(http as any);

    await expect(service.refreshAccessToken('refresh-token')).rejects.toBeInstanceOf(
      ShaamReauthorizationRequiredError,
    );
  });

  it('classifies invalid_scope during refresh as requiring a new authorization', async () => {
    const http = {
      post: jest.fn().mockReturnValue(
        throwError(() => ({
          response: {
            status: 400,
            data: {
              error: 'invalid_scope',
              error_description: 'Scope is not allowed',
            },
          },
        })),
      ),
    };
    const service = new ShaamOauthService(http as any);

    await expect(service.refreshAccessToken('old-scope-refresh-token'))
      .rejects.toBeInstanceOf(ShaamReauthorizationRequiredError);
  });

  it('does not classify a server failure as a revoked authorization', async () => {
    const http = {
      post: jest.fn().mockReturnValue(
        throwError(() => ({
          response: {
            status: 503,
            data: { error: 'temporarily_unavailable' },
          },
        })),
      ),
    };
    const service = new ShaamOauthService(http as any);

    await expect(service.refreshAccessToken('refresh-token')).rejects.not.toBeInstanceOf(
      ShaamReauthorizationRequiredError,
    );
  });
});
