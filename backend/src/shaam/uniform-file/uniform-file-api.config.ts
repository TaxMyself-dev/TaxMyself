import { ShaamEnvironment } from '../shaam.constants';

export const UNIFORM_FILE_API_CONFIG = Symbol('UNIFORM_FILE_API_CONFIG');

const TSANDBOX_UPLOAD_LINKS_URL =
  'https://t-ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles';
const TSANDBOX_STATUS_URL =
  'https://t-ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status';

export interface UniformFileApiConfig {
  enabled: boolean;
  environment: ShaamEnvironment;
  clientId: string;
  uploadLinksUrl: string;
  statusUrl: string;
}

export function loadUniformFileApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): UniformFileApiConfig {
  const enabled = env.SHAAM_UNIFORM_FILE_ENABLED === 'true';
  const environment = String(
    env.SHAAM_UNIFORM_FILE_ENV || ShaamEnvironment.TSANDBOX,
  )
    .trim()
    .toLowerCase() as ShaamEnvironment;

  if (!Object.values(ShaamEnvironment).includes(environment)) {
    throw new Error(
      'SHAAM_UNIFORM_FILE_ENV must be either "tsandbox" or "production"',
    );
  }

  const config: UniformFileApiConfig = {
    enabled,
    environment,
    clientId: env.SHAAM_UNIFORM_FILE_CLIENT_ID?.trim() || '',
    uploadLinksUrl: '',
    statusUrl: '',
  };
  if (!enabled) return config;
  if (!config.clientId) {
    throw new Error(
      'Uniform-file SHAAM API is enabled but SHAAM_UNIFORM_FILE_CLIENT_ID is missing',
    );
  }
  if (environment === ShaamEnvironment.PRODUCTION) {
    throw new Error(
      'Uniform-file SHAAM production API endpoints are not yet verified',
    );
  }

  config.uploadLinksUrl = TSANDBOX_UPLOAD_LINKS_URL;
  config.statusUrl = TSANDBOX_STATUS_URL;
  return config;
}
