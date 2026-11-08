import { ShaamEnvironment } from '../shaam.constants';

export const UNIFORM_FILE_OAUTH_CONFIG = Symbol('UNIFORM_FILE_OAUTH_CONFIG');

export const UNIFORM_FILE_OAUTH_SCOPES = [
  'UniStructFileUploadLinks_scope',
  'FilesStatus_scope',
] as const;

export interface UniformFileOauthConfig {
  enabled: boolean;
  environment: ShaamEnvironment;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  uploadLinksUrl: string;
  statusUrl: string;
  sandboxCaseNumberOverride: string | null;
  scopes: readonly string[];
}

const TSANDBOX_DEFAULTS = {
  authorizeUrl:
    'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/authorize',
  tokenUrl:
    'https://openapi.taxes.gov.il/shaam/tsandbox/dailytoken/oauth2/token',
  uploadLinksUrl:
    'https://ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
  statusUrl:
    'https://ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status',
} as const;

function parseEnvironment(value: string | undefined): ShaamEnvironment {
  const normalized = (value || ShaamEnvironment.TSANDBOX).trim().toLowerCase();
  if (normalized !== ShaamEnvironment.TSANDBOX && normalized !== ShaamEnvironment.PRODUCTION) {
    throw new Error(
      'SHAAM_UNIFORM_FILE_ENV must be either "tsandbox" or "production"',
    );
  }
  return normalized as ShaamEnvironment;
}

function assertTaxAuthorityUrl(name: string, value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'openapi.taxes.gov.il') {
    throw new Error(
      `${name} must use https://openapi.taxes.gov.il; refusing an unverified OAuth endpoint`,
    );
  }
}

function assertRedirectUri(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SHAAM_UNIFORM_FILE_REDIRECT_URI must be a valid absolute URL');
  }

  const isLocalDevelopment =
    parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error(
      'SHAAM_UNIFORM_FILE_REDIRECT_URI must use HTTPS outside local development',
    );
  }
}

function assertUniformFileApiUrl(
  name: string,
  value: string,
  environment: ShaamEnvironment,
  suffix: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
  const allowedHosts = new Set(['openapi.taxes.gov.il', 'ita-api.taxes.gov.il']);
  const expectedPath = `/shaam/${environment}/${suffix}`;
  if (
    parsed.protocol !== 'https:' ||
    !allowedHosts.has(parsed.hostname) ||
    parsed.pathname !== expectedPath ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must use a verified Tax Authority ${expectedPath} endpoint`);
  }
}

export function loadUniformFileOauthConfig(
  env: NodeJS.ProcessEnv = process.env,
): UniformFileOauthConfig {
  const enabled = env.SHAAM_UNIFORM_FILE_ENABLED === 'true';
  const environment = parseEnvironment(env.SHAAM_UNIFORM_FILE_ENV);
  const sandboxDefaults =
    environment === ShaamEnvironment.TSANDBOX ? TSANDBOX_DEFAULTS : undefined;

  const config: UniformFileOauthConfig = {
    enabled,
    environment,
    clientId:
      env.SHAAM_UNIFORM_FILE_CLIENT_ID?.trim() || env.SHAAM_CLIENT_ID?.trim() || '',
    clientSecret:
      env.SHAAM_UNIFORM_FILE_CLIENT_SECRET || env.SHAAM_CLIENT_SECRET || '',
    redirectUri:
      env.SHAAM_UNIFORM_FILE_REDIRECT_URI?.trim() ||
      env.SHAAM_REDIRECT_URI?.trim() ||
      '',
    authorizeUrl:
      env.SHAAM_UNIFORM_FILE_AUTHORIZE_URL?.trim() ||
      sandboxDefaults?.authorizeUrl ||
      '',
    tokenUrl:
      env.SHAAM_UNIFORM_FILE_TOKEN_URL?.trim() || sandboxDefaults?.tokenUrl || '',
    uploadLinksUrl:
      env.SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL?.trim() ||
      sandboxDefaults?.uploadLinksUrl ||
      '',
    statusUrl:
      env.SHAAM_UNIFORM_FILE_STATUS_URL?.trim() || sandboxDefaults?.statusUrl || '',
    sandboxCaseNumberOverride:
      env.SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER?.trim() || null,
    scopes: UNIFORM_FILE_OAUTH_SCOPES,
  };

  if (!enabled) return config;

  const missing = [
    ['SHAAM_UNIFORM_FILE_CLIENT_ID or SHAAM_CLIENT_ID', config.clientId],
    ['SHAAM_UNIFORM_FILE_CLIENT_SECRET or SHAAM_CLIENT_SECRET', config.clientSecret],
    ['SHAAM_UNIFORM_FILE_REDIRECT_URI or SHAAM_REDIRECT_URI', config.redirectUri],
    ['SHAAM_UNIFORM_FILE_AUTHORIZE_URL', config.authorizeUrl],
    ['SHAAM_UNIFORM_FILE_TOKEN_URL', config.tokenUrl],
    ['SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL', config.uploadLinksUrl],
    ['SHAAM_UNIFORM_FILE_STATUS_URL', config.statusUrl],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Uniform-file SHAAM OAuth is enabled but missing: ${missing.join(', ')}`,
    );
  }

  if (
    environment === ShaamEnvironment.PRODUCTION &&
    env.SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED !== 'true'
  ) {
    throw new Error(
      'Uniform-file SHAAM production is disabled; set SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED=true only for an approved production activation',
    );
  }

  if (
    config.sandboxCaseNumberOverride &&
    !/^\d{9}$/.test(config.sandboxCaseNumberOverride)
  ) {
    throw new Error(
      'SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER must contain exactly nine digits',
    );
  }
  if (
    environment === ShaamEnvironment.PRODUCTION &&
    config.sandboxCaseNumberOverride
  ) {
    throw new Error(
      'SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER is forbidden in production',
    );
  }

  assertTaxAuthorityUrl('SHAAM_UNIFORM_FILE_AUTHORIZE_URL', config.authorizeUrl);
  assertTaxAuthorityUrl('SHAAM_UNIFORM_FILE_TOKEN_URL', config.tokenUrl);
  assertUniformFileApiUrl(
    'SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL',
    config.uploadLinksUrl,
    environment,
    'UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles',
  );
  assertUniformFileApiUrl(
    'SHAAM_UNIFORM_FILE_STATUS_URL',
    config.statusUrl,
    environment,
    'FilesStatusApi/v1/Files/get-file-status',
  );
  assertRedirectUri(config.redirectUri);

  return config;
}
