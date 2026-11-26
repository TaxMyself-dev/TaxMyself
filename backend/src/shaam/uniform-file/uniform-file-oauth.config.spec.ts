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
        SHAAM_UNIFORM_FILE_AUTHORIZE_URL:
          'https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/authorize',
        SHAAM_UNIFORM_FILE_TOKEN_URL:
          'https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/token',
        SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL:
          'https://ita-api.taxes.gov.il/shaam/production/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
        SHAAM_UNIFORM_FILE_STATUS_URL:
          'https://ita-api.taxes.gov.il/shaam/production/FilesStatusApi/v1/Files/get-file-status',
      }),
    ).toThrow('production is disabled');
  });

  describe('portal production configuration', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      SHAAM_UNIFORM_FILE_ENABLED: 'true',
      SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED: 'true',
      SHAAM_UNIFORM_FILE_ENV: 'production',
      SHAAM_CLIENT_ID: 'shared-production-client',
      SHAAM_CLIENT_SECRET: 'synthetic-production-secret',
      SHAAM_REDIRECT_URI: 'https://backend.example/shaam/oauth/callback',
      SHAAM_SCOPES: 'invoices_scope',
      SHAAM_UNIFORM_FILE_REDIRECT_URI:
        'https://taxmys16elf-prod-146140406969.me-west1.run.app/shaam/oauth/callback',
      SHAAM_UNIFORM_FILE_AUTHORIZE_URL:
        'https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/authorize',
      SHAAM_UNIFORM_FILE_TOKEN_URL:
        'https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/token',
      SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL:
        'https://openapi.taxes.gov.il/shaam/production/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
      SHAAM_UNIFORM_FILE_STATUS_URL:
        'https://openapi.taxes.gov.il/shaam/production/FilesStatusApi/v1/Files/get-file-status',
    };

    it('reuses application credentials without inheriting invoice scopes', () => {
      expect(loadUniformFileOauthConfig(productionEnv)).toMatchObject({
        enabled: true,
        environment: ShaamEnvironment.PRODUCTION,
        clientId: 'shared-production-client',
        clientSecret: 'synthetic-production-secret',
        redirectUri: productionEnv.SHAAM_UNIFORM_FILE_REDIRECT_URI,
        authorizeUrl: productionEnv.SHAAM_UNIFORM_FILE_AUTHORIZE_URL,
        tokenUrl: productionEnv.SHAAM_UNIFORM_FILE_TOKEN_URL,
        uploadLinksUrl: productionEnv.SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL,
        statusUrl: productionEnv.SHAAM_UNIFORM_FILE_STATUS_URL,
        sandboxCaseNumberOverride: null,
        scopes: ['UniStructFileUploadLinks_scope', 'FilesStatus_scope'],
      });
    });

    it('allows preparing production configuration with both switches off', () => {
      expect(loadUniformFileOauthConfig({
        ...productionEnv,
        SHAAM_UNIFORM_FILE_ENABLED: 'false',
        SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED: 'false',
      })).toMatchObject({ enabled: false, environment: ShaamEnvironment.PRODUCTION });
    });

    it.each([
      'SHAAM_UNIFORM_FILE_AUTHORIZE_URL',
      'SHAAM_UNIFORM_FILE_TOKEN_URL',
      'SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL',
      'SHAAM_UNIFORM_FILE_STATUS_URL',
    ])('requires an explicit production endpoint for %s', (key) => {
      expect(() => loadUniformFileOauthConfig({
        ...productionEnv,
        [key]: undefined,
      })).toThrow(key);
    });

    it.each([
      'SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL',
      'SHAAM_UNIFORM_FILE_STATUS_URL',
    ])('rejects a sandbox API endpoint in %s', (key) => {
      expect(() => loadUniformFileOauthConfig({
        ...productionEnv,
        [key]: productionEnv[key]!.replace('/production/', '/tsandbox/'),
      })).toThrow(key);
    });

    it('rejects a sandbox case override in production', () => {
      expect(() => loadUniformFileOauthConfig({
        ...productionEnv,
        SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER: '777777723',
      })).toThrow('SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER is forbidden in production');
    });
  });
});
