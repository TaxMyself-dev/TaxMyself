import { ShaamEnvironment } from '../shaam.constants';
import { loadUniformFileOauthConfig } from './uniform-file-oauth.config';

export const UNIFORM_FILE_API_CONFIG = Symbol('UNIFORM_FILE_API_CONFIG');

export interface UniformFileApiConfig {
  enabled: boolean;
  environment: ShaamEnvironment;
  clientId: string;
  uploadLinksUrl: string;
  statusUrl: string;
  sandboxCaseNumberOverride: string | null;
}

export function loadUniformFileApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): UniformFileApiConfig {
  const oauth = loadUniformFileOauthConfig(env);
  return {
    enabled: oauth.enabled,
    environment: oauth.environment,
    clientId: oauth.clientId,
    uploadLinksUrl: oauth.uploadLinksUrl,
    statusUrl: oauth.statusUrl,
    sandboxCaseNumberOverride: oauth.sandboxCaseNumberOverride,
  };
}
