/** Store only bounded human-readable descriptions, never raw provider bodies/config. */
export function sanitizeCardcomDescription(value: unknown, secrets: string[] = []): string | null {
  if (typeof value !== 'string') return null;
  let text = value;
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[redacted]');
  text = text.replace(/(?:ApiPassword|ApiName|password|token|CVV2?|CardNumber)\s*[=:]\s*[^\s,;]+/gi, '[redacted]')
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '[redacted-card]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[redacted-token]')
    .replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
  return text || null;
}
