import { FeezbackHttpError } from './feezback-errors';

const sensitiveField = /token|jwt|authorization|cookie|secret|password|private.?key|email|phone|firebase|account.?number|card.?number|iban|pan|address|identity|^sub$|^name$|credential|api.?key|client.?id|client.?secret|^config$|^request$/i;

/** Error response only: never serialize Axios config, request headers or credentials. */
export function feeZbackErrorDiagnostic(error: FeezbackHttpError, secrets: string[] = [], timing?: { attempt: number; maxAttempts: number; durationMs: number; syncRunId?: string; connectionRole?: string; sourceRecordId?: number; sourceRecordIds?: number[]; operation?: string }): string {
  const text = (value: string) => {
    value = value.replace(/(https?:\/\/[^\s"'<>?#]+)[?#][^\s"'<>]*/gi, '$1');
    for (const secret of secrets.filter(Boolean)) value = value.split(secret).join('<REDACTED>');
    return value
      .replace(/(\/users\/)[^/\s?]+/gi, '$1<REDACTED>')
      .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '<REDACTED>')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<REDACTED>')
      .replace(/\bBearer\s+[^\s"',<>]+/gi, 'Bearer <REDACTED>')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<REDACTED>');
  };
  const seen = new WeakSet<object>();
  const clean = (value: unknown, depth = 0): unknown => {
    if (typeof value === 'string') {
      if (depth > 15) return '<OMITTED>';
      try { return clean(JSON.parse(value), depth + 1); } catch { return text(value).slice(0, 8192); }
    }
    if (!value || typeof value !== 'object') return value;
    if (depth > 15 || seen.has(value)) return '<OMITTED>';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 50).map(item => clean(item, depth + 1));
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) =>
      [key, sensitiveField.test(key) ? '<REDACTED>' : clean(item, depth + 1)]));
  };
  const responseBody = clean(error.responseBody ?? null);
  const encodedBody = JSON.stringify(responseBody);
  const rawProviderCode = (responseBody as any)?.error?.code ?? (responseBody as any)?.error_code;
  const providerCode = typeof rawProviderCode === 'number' && Number.isFinite(rawProviderCode) ? rawProviderCode
    : typeof rawProviderCode === 'string' && /^[A-Za-z0-9_:-]{1,80}$/.test(rawProviderCode) ? rawProviderCode : undefined;
  return JSON.stringify({ providerCode, method: error.method, url: text(error.url.split(/[?#]/)[0]), status: error.status,
    ...timing, code: error.code, message: text(error.message), responseBody: encodedBody.length > 16384 ? encodedBody.slice(0, 16384) + '<TRUNCATED>' : responseBody });
}
