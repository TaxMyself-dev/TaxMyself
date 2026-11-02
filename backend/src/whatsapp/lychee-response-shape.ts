/** Bounded schema metadata only. Never includes primitive values or array sizes. */
export function lycheeResponseShape(value: unknown): Record<string, string> {
  const shape: Record<string, string> = {};
  const seen = new Set<object>();
  const secrets = [
    process.env.LYCHEE_API_KEY,
    process.env.LYCHEE_WEBHOOK_SECRET,
  ].filter(Boolean);
  function visit(item: unknown, path: string, depth: number): void {
    if (Object.keys(shape).length >= 40) return;
    const type =
      item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item;
    shape[path] = type;
    if (depth >= 3 || !item || typeof item !== 'object' || seen.has(item))
      return;
    seen.add(item);
    if (Array.isArray(item)) {
      if (item.length) visit(item[0], path + '[]', depth + 1);
      return;
    }
    let omitted = false;
    for (const key of Object.keys(item).slice(0, 20)) {
      // Unusual/dynamic keys may themselves contain private values or credentials.
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(key) || secrets.includes(key)) {
        omitted = true;
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor)) continue;
      if (
        /authorization|cookie|password|secret|token|headers|config|request/i.test(
          key,
        )
      ) {
        if (Object.keys(shape).length < 40) shape[path + '.' + key] = 'omitted';
      } else visit(descriptor.value, path + '.' + key, depth + 1);
    }
    if (omitted && Object.keys(shape).length < 40)
      shape[path + '.[omitted_key]'] = 'omitted';
  }
  visit(value, '$', 0);
  return shape;
}
