import { ACQUIRE_DRIVE_LOCK, RELEASE_DRIVE_LOCK } from '../users/drive-provisioning-lock';

type LockQuery = (
  sql: string,
  parameters: string[],
) => Promise<readonly Record<string, unknown>[]>;

// Each GET_LOCK waits at most 30 seconds. Cleanup may start while signup/login
// is still provisioning Drive; allow up to two minutes without bypassing it.
const MAX_LOCK_ATTEMPTS = 4;

export async function withSmokeDriveLock<T>(
  query: LockQuery,
  firebaseId: string,
  action: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt++) {
    const rows = await query(ACQUIRE_DRIVE_LOCK, [firebaseId]);
    const acquired = rows[0]?.acquired;
    if (acquired === 1 || acquired === '1') {
      try { return await action(); }
      finally { await query(RELEASE_DRIVE_LOCK, [firebaseId]); }
    }
    // Only a real lock timeout (0) is retryable. NULL/missing/unexpected
    // results indicate an error and must never permit destructive work.
    if (acquired !== 0 && acquired !== '0') {
      throw new Error('Smoke cleanup received an invalid Drive provisioning lock result');
    }
    if (attempt < MAX_LOCK_ATTEMPTS) {
      console.warn(JSON.stringify({
        status: 'waiting', code: 'SMOKE_DRIVE_LOCK_BUSY', attempt,
        maxAttempts: MAX_LOCK_ATTEMPTS,
      }));
    }
  }
  throw new Error('Smoke cleanup could not acquire the Drive provisioning lock after 4 attempts (up to 120 seconds)');
}
