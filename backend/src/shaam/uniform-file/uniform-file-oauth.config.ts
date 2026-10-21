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
  stateSecret: string;
  scopes: readonly string[];
}
const REQUIRED_WHEN_ENABLED = [
  'SHAAM_UNIFORM_FILE_CLIENT_ID',
  'SHAAM_UNIFORM_FILE_CLIENT_SECRET',
  'SHAAM_UNIFORM_FILE_REDIRECT_URI',
  'SHAAM_UNIFORM_FILE_AUTHORIZE_URL',
  'SHAAM_UNIFORM_FILE_TOKEN_URL',
  'SHAAM_UNIFORM_FILE_STATE_SECRET',
] as const;

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

export function loadUniformFileOauthConfig(
  env: NodeJS.ProcessEnv = process.env,
): UniformFileOauthConfig {
  const enabled = env.SHAAM_UNIFORM_FILE_ENABLED === 'true';
  const environment = parseEnvironment(env.SHAAM_UNIFORM_FILE_ENV);

  const config: UniformFileOauthConfig = {
    enabled,
    environment,
    clientId: env.SHAAM_UNIFORM_FILE_CLIENT_ID?.trim() || '',
    clientSecret: env.SHAAM_UNIFORM_FILE_CLIENT_SECRET || '',
    redirectUri: env.SHAAM_UNIFORM_FILE_REDIRECT_URI?.trim() || '',
    authorizeUrl: env.SHAAM_UNIFORM_FILE_AUTHORIZE_URL?.trim() || '',
    tokenUrl: env.SHAAM_UNIFORM_FILE_TOKEN_URL?.trim() || '',
    stateSecret: env.SHAAM_UNIFORM_FILE_STATE_SECRET || '',
    scopes: UNIFORM_FILE_OAUTH_SCOPES,
  };

  if (!enabled) return config;

  const missing = REQUIRED_WHEN_ENABLED.filter((name) => !env[name]?.trim());
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

  if (Buffer.byteLength(config.stateSecret, 'utf8') < 32) {
    throw new Error('SHAAM_UNIFORM_FILE_STATE_SECRET must contain at least 32 bytes');
  }

  assertTaxAuthorityUrl('SHAAM_UNIFORM_FILE_AUTHORIZE_URL', config.authorizeUrl);
  assertTaxAuthorityUrl('SHAAM_UNIFORM_FILE_TOKEN_URL', config.tokenUrl);
  assertRedirectUri(config.redirectUri);

  return config;
}
