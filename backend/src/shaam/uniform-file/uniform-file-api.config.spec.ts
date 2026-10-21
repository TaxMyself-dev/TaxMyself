import { ShaamEnvironment } from '../shaam.constants';
import { loadUniformFileApiConfig } from './uniform-file-api.config';

describe('loadUniformFileApiConfig', () => {
  it('stays disabled without configuration', () => {
    expect(loadUniformFileApiConfig({})).toEqual({
      enabled: false,
      environment: ShaamEnvironment.TSANDBOX,
      clientId: '',
      uploadLinksUrl: '',
      statusUrl: '',
    });
  });

  it('uses the portal-verified tsandbox endpoints', () => {
    expect(
      loadUniformFileApiConfig({
        SHAAM_UNIFORM_FILE_ENABLED: 'true',
        SHAAM_UNIFORM_FILE_ENV: 'tsandbox',
        SHAAM_UNIFORM_FILE_CLIENT_ID: 'client-id',
      }),
    ).toMatchObject({
      uploadLinksUrl:
        'https://t-ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
      statusUrl:
        'https://t-ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status',
    });
  });

  it('keeps production fail-closed until its endpoints are verified', () => {
    expect(() =>
      loadUniformFileApiConfig({
        SHAAM_UNIFORM_FILE_ENABLED: 'true',
        SHAAM_UNIFORM_FILE_ENV: 'production',
        SHAAM_UNIFORM_FILE_CLIENT_ID: 'client-id',
      }),
    ).toThrow('production API endpoints are not yet verified');
  });
});
