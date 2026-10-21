import { ShaamEnvironment } from '../shaam.constants';
import {
  loadUniformFileOauthConfig,
  UNIFORM_FILE_OAUTH_SCOPES,
} from './uniform-file-oauth.config';

describe('loadUniformFileOauthConfig', () => {
  const validEnv: NodeJS.ProcessEnv = {
    SHAAM_UNIFORM_FILE_ENABLED: 'true',
    SHAAM_UNIFORM_FILE_ENV: 'tsandbox',
    SHAAM_UNIFORM_FILE_CLIENT_ID: 'client-id',
    SHAAM_UNIFORM_FILE_CLIENT_SECRET: 'client-secret',
    SHAAM_UNIFORM_FILE_REDIRECT_URI:
      'http://localhost:3000/shaam/oauth/callback',
    SHAAM_UNIFORM_FILE_AUTHORIZE_URL:
      'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/authorize',
    SHAAM_UNIFORM_FILE_TOKEN_URL:
      'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/token',
    SHAAM_UNIFORM_FILE_STATE_SECRET: 'a'.repeat(32),
  };

  it('stays safely disabled without credentials', () => {
    expect(loadUniformFileOauthConfig({})).toMatchObject({
      enabled: false,
      environment: ShaamEnvironment.TSANDBOX,
      scopes: UNIFORM_FILE_OAUTH_SCOPES,
    });
  });

  it('loads the exact uniform-file scopes when enabled', () => {
    const config = loadUniformFileOauthConfig(validEnv);

    expect(config.enabled).toBe(true);
    expect(config.scopes).toEqual([
      'UniStructFileUploadLinks_scope',
      'FilesStatus_scope',
    ]);
  });

  it('fails closed when required configuration is missing', () => {
    expect(() =>
      loadUniformFileOauthConfig({ SHAAM_UNIFORM_FILE_ENABLED: 'true' }),
    ).toThrow('SHAAM_UNIFORM_FILE_CLIENT_ID');
  });

  it('rejects a non-Tax-Authority OAuth endpoint', () => {
    expect(() =>
      loadUniformFileOauthConfig({
        ...validEnv,
        SHAAM_UNIFORM_FILE_TOKEN_URL: 'https://example.com/token',
      }),
    ).toThrow('https://openapi.taxes.gov.il');
  });

  it('requires a separate explicit production switch', () => {
    expect(() =>
      loadUniformFileOauthConfig({
        ...validEnv,
        SHAAM_UNIFORM_FILE_ENV: 'production',
      }),
    ).toThrow('production is disabled');
  });
});
