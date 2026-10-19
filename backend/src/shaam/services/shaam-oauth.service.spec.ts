import { throwError } from 'rxjs';
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
  });

  afterAll(() => {
    process.env = originalEnv;
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
