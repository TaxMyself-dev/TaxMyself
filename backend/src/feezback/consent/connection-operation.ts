/** Serialize discovery and disconnect within this process so an older read cannot win. */
const pending = new Map<string, Promise<unknown>>();
export async function connectionOperation<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = pending.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  pending.set(userId, current);
  try { return await current; }
  finally { if (pending.get(userId) === current) pending.delete(userId); }
}
