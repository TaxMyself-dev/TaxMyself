import type { FeezbackHttpError } from './feezback-errors';

export const PUBLIC_KEY_LOOKUP_RETRY_DELAY_MS = 200;

/** Feezback's observed intermittent LGS key lookup failure; other 400s stay final. */
export function isPublicKeyLookupFailure(error: FeezbackHttpError): boolean {
  const body = error.responseBody;
  return error.status === 400 && !!body && typeof body === 'object' && !Array.isArray(body) &&
    (body as { error_code?: unknown }).error_code === 1004;
}

export function isConfiguredKeyLookupPost(method: string, url: string, endpoints: Array<string | undefined>): boolean {
  if (method !== 'POST') return false;
  try {
    const target = new URL(url).href;
    return endpoints.some(endpoint => {
      try { return !!endpoint && new URL(endpoint).href === target; }
      catch { return false; }
    });
  } catch { return false; }
}
