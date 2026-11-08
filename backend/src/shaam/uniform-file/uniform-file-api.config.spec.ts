import { ShaamEnvironment } from '../shaam.constants';
import { loadUniformFileApiConfig } from './uniform-file-api.config';

describe('loadUniformFileApiConfig', () => {
  const enabledSandbox = {
    SHAAM_UNIFORM_FILE_ENABLED: 'true',
    SHAAM_UNIFORM_FILE_ENV: 'tsandbox',
    SHAAM_UNIFORM_FILE_CLIENT_ID: 'client-id',
    SHAAM_UNIFORM_FILE_CLIENT_SECRET: 'client-secret',
    SHAAM_UNIFORM_FILE_REDIRECT_URI: 'http://localhost:3000/shaam/oauth/callback',
  };

  it('stays disabled without credentials while retaining safe sandbox defaults', () => {
    expect(loadUniformFileApiConfig({})).toMatchObject({
      enabled: false,
      environment: ShaamEnvironment.TSANDBOX,
      clientId: '',
      sandboxCaseNumberOverride: null,
    });
  });

  it('uses the same portal-verified tsandbox endpoints as Daily Token OAuth', () => {
    expect(loadUniformFileApiConfig(enabledSandbox)).toMatchObject({
      uploadLinksUrl:
        'https://ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
      statusUrl:
        'https://ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status',
      sandboxCaseNumberOverride: null,
    });
  });

  it('passes through an explicit sandbox fixture case number', () => {
    expect(
      loadUniformFileApiConfig({
        ...enabledSandbox,
        SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER: '777777723',
      }),
    ).toMatchObject({ sandboxCaseNumberOverride: '777777723' });
  });

  it('keeps production behind the separate activation switch', () => {
    expect(() =>
      loadUniformFileApiConfig({
        ...enabledSandbox,
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
});
