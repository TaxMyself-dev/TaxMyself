import { FeezbackHttpError } from './feezback-errors';

const sensitiveField = /token|jwt|authorization|cookie|secret|password|private.?key|email|phone|firebase|account.?number|card.?number|identity|^sub$|^name$/i;

/** Error response only: never serialize Axios config, request headers or credentials. */
export function feeZbackErrorDiagnostic(error: FeezbackHttpError, secrets: string[] = []): string {
  const text = (value: string) => {
    for (const secret of secrets.filter(Boolean)) value = value.split(secret).join('<REDACTED>');
    return value
      .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '<REDACTED>')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<REDACTED>')
      .replace(/\bBearer\s+[^\s"',<>]+/gi, 'Bearer <REDACTED>')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<REDACTED>');
  };
  const seen = new WeakSet<object>();
  const clean = (value: unknown, depth = 0): unknown => {
    if (typeof value === 'string') {
      try { return clean(JSON.parse(value), depth + 1); } catch { return text(value); }
    }
    if (!value || typeof value !== 'object') return value;
    if (depth > 15 || seen.has(value)) return '<OMITTED>';
    seen.add(value);
    if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, sensitiveField.test(key) ? '<REDACTED>' : clean(item, depth + 1)]));
  };
  return JSON.stringify({ method: error.method, url: error.url.split('?')[0], status: error.status,
    code: error.code, message: text(error.message), responseBody: clean(error.responseBody ?? null) });
}
