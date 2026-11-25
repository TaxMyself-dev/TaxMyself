import type { DataSource, QueryRunner } from 'typeorm';

// Connection-scoped and shared by HTTP instances and the private cleanup job.
// DATABASE() isolates development/production users hosted on the same server.
export const ACQUIRE_DRIVE_LOCK = "SELECT GET_LOCK(SHA2(CONCAT(DATABASE(), ':drive:', ?), 256), 30) AS acquired";
export const RELEASE_DRIVE_LOCK = "SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(), ':drive:', ?), 256)) AS released";

export async function withDriveProvisioningLock<T>(
  dataSource: Pick<DataSource, 'createQueryRunner'>,
  firebaseId: string,
  action: (runner: QueryRunner) => Promise<T>,
): Promise<T> {
  const runner = dataSource.createQueryRunner();
  let acquired = false;
  try {
    await runner.connect();
    const rows = await runner.query(ACQUIRE_DRIVE_LOCK, [firebaseId]);
    acquired = Number(rows?.[0]?.acquired) === 1;
    if (!acquired) throw new Error('Drive provisioning lock could not be acquired');
    return await action(runner);
  } finally {
    try { if (acquired) await runner.query(RELEASE_DRIVE_LOCK, [firebaseId]); }
    finally { await runner.release(); }
  }
}
