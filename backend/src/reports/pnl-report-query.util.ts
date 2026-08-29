/**
 * Query parameters normally arrive as strings, but Nest pipes/adapters may
 * already have converted them to booleans. Accept both representations so a
 * selected P&L option cannot silently fall back to its default.
 */
export function parseBooleanQueryFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}
