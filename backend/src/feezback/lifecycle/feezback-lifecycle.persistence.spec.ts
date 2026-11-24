import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { createConnection, Connection } from 'mysql2/promise';
import { enqueueLifecycle } from './feezback-lifecycle.service';

const describeDatabase =
  process.env.FEEZBACK_LIFECYCLE_DB_TEST === 'true' ? describe : describe.skip;
describeDatabase('Feezback MySQL temporary-table persistence', () => {
  let connection: Connection;
  beforeAll(async () => {
    config({ path: resolve(process.cwd(), '.env') });
    if (process.env.DB_DATABASE !== 'keepintax-dev')
      throw new Error(
        'Persistence test requires the explicit development database',
      );
    connection = await createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      timezone: 'Z',
      connectTimeout: 10000,
    });
    const sql = readFileSync(
      resolve(process.cwd(), '../docs/features/feezback-lifecycle.sql'),
      'utf8',
    ).replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE');
    // Connection-scoped temporary table shadows any real table; no permanent DDL/data changes.
    await connection.query(sql);
    process.env.FEEZBACK_LIFECYCLE_ENABLED = 'true';
  }, 20000);
  afterAll(async () => {
    delete process.env.FEEZBACK_LIFECYCLE_ENABLED;
    await connection?.end();
  });
  it('rolls queue insertion back together with the originating transaction', async () => {
    await connection.beginTransaction();
    await enqueueLifecycle(
      {
        query: (sql: string, args: any[]) => connection.query(sql, args),
      } as any,
      'rollback-owner',
    );
    await connection.rollback();
    const [rows] = await connection.query<any[]>(
      'SELECT * FROM feezback_lifecycle WHERE firebase_id=?',
      ['rollback-owner'],
    );
    expect(rows).toHaveLength(0);
  });
  it('preserves a manual request across webhook refreshes and rejects stale completion', async () => {
    const manager = {
      query: (sql: string, args: any[]) => connection.query(sql, args),
    } as any;
    await enqueueLifecycle(manager, 'owner', true, 'admin');
    await connection.query(
      "UPDATE feezback_lifecycle SET lease_token='lease',lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) WHERE firebase_id='owner'",
    );
    await enqueueLifecycle(manager, 'owner');
    const [rows] = await connection.query<any[]>(
      "SELECT * FROM feezback_lifecycle WHERE firebase_id='owner'",
    );
    expect(rows[0]).toMatchObject({
      generation: 2,
      disconnect_requested: 1,
      requested_by: 'admin',
      lease_token: 'lease',
    });
    const [result] = await connection.query<any>(
      "UPDATE feezback_lifecycle SET last_action='DISCONNECTED',disconnect_requested=0 WHERE firebase_id='owner' AND generation=1 AND lease_token='lease'",
    );
    expect(result.affectedRows).toBe(0);
  });
});
