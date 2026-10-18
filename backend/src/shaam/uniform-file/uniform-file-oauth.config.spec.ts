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
    SHAAM_UNIFORM_FILE_REDIRECT_URI: 'http://localhost:3000/shaam/oauth/callback',
    SHAAM_UNIFORM_FILE_AUTHORIZE_URL:
      'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/authorize',
    SHAAM_UNIFORM_FILE_TOKEN_URL:
      'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/token',
    SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL:
      'https://ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
    SHAAM_UNIFORM_FILE_STATUS_URL:
      'https://ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status',
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

  it('reuses the existing SHAAM app and verified tsandbox endpoints by default', () => {
    const config = loadUniformFileOauthConfig({
      SHAAM_UNIFORM_FILE_ENABLED: 'true',
      SHAAM_CLIENT_ID: 'shared-client-id',
      SHAAM_CLIENT_SECRET: 'shared-client-secret',
      SHAAM_REDIRECT_URI: 'http://localhost:3000/shaam/oauth/callback',
    });

    expect(config).toMatchObject({
      clientId: 'shared-client-id',
      clientSecret: 'shared-client-secret',
      redirectUri: 'http://localhost:3000/shaam/oauth/callback',
      authorizeUrl:
        'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/authorize',
      tokenUrl:
        'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/token',
      uploadLinksUrl:
        'https://ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
      statusUrl:
        'https://ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status',
    });
  });

  it('fails closed when required configuration is missing', () => {
    expect(() =>
      loadUniformFileOauthConfig({ SHAAM_UNIFORM_FILE_ENABLED: 'true' }),
    ).toThrow('SHAAM_UNIFORM_FILE_CLIENT_ID or SHAAM_CLIENT_ID');
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

  it('rejects a wrong uniform-file API path or environment', () => {
    expect(() => loadUniformFileOauthConfig({
      ...validEnv,
      SHAAM_UNIFORM_FILE_STATUS_URL:
        'https://ita-api.taxes.gov.il/shaam/production/FilesStatusApi/v1/Files/get-file-status',
    })).toThrow('verified Tax Authority');
  });

  it('loads a valid sandbox case-number override', () => {
    expect(loadUniformFileOauthConfig({
      ...validEnv,
      SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER: '777777723',
    }).sandboxCaseNumberOverride).toBe('777777723');
  });

  it('rejects a malformed sandbox case-number override', () => {
    expect(() => loadUniformFileOauthConfig({
      ...validEnv,
      SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER: '777',
    })).toThrow('exactly nine digits');
  });

  it('forbids the sandbox case-number override in production', () => {
    expect(() => loadUniformFileOauthConfig({
      ...validEnv,
      SHAAM_UNIFORM_FILE_ENV: 'production',
      SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED: 'true',
      SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER: '777777723',
      SHAAM_UNIFORM_FILE_AUTHORIZE_URL:
        'https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/authorize',
      SHAAM_UNIFORM_FILE_TOKEN_URL:
        'https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/token',
      SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL:
        'https://openapi.taxes.gov.il/shaam/production/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
      SHAAM_UNIFORM_FILE_STATUS_URL:
        'https://openapi.taxes.gov.il/shaam/production/FilesStatusApi/v1/Files/get-file-status',
    })).toThrow('forbidden in production');
  });
});
