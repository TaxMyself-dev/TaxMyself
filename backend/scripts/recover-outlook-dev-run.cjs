// Explicit DEV recovery of one false-expired Microsoft connection and paused run.
// Default inspects; --apply requires live owner/account/profile verification first.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const cfg = require('dotenv').parse(
  fs.readFileSync(path.join(__dirname, '../.env')),
);
async function main() {
  const args = process.argv.slice(2);
  const target = args.find((x) => /^--integration-id=[1-9]\d*$/.test(x));
  if (!target || args.some((x) => x !== target && x !== '--apply'))
    throw Error('REFUSED: exact integration ID required');
  if (
    cfg.DB_DATABASE !== 'keepintax-dev' ||
    cfg.COMPOSIO_ENVIRONMENT !== 'dev' ||
    cfg.DISABLE_SYNCHRONIZE !== 'true'
  )
    throw Error('REFUSED: DEV required');
  const id = Number(target.split('=')[1]);
  if (!Number.isSafeInteger(id)) throw Error('REFUSED: invalid ID');
  Object.assign(process.env, cfg, { NODE_ENV: 'development' });
  const db = await mysql.createConnection({
    host: cfg.DB_HOST,
    port: Number(cfg.DB_PORT || 3306),
    user: cfg.DB_USERNAME,
    password: cfg.DB_PASSWORD,
    database: 'keepintax-dev',
    connectTimeout: 10000,
    multipleStatements: false,
  });
  let locked = false;
  let transaction = false;
  try {
    const [[identity]] = await db.query('SELECT DATABASE() db');
    if (identity.db !== 'keepintax-dev')
      throw Error('REFUSED: database mismatch');
    const [[lock]] = await db.query(
      "SELECT GET_LOCK('gmail-durable-scan',5) acquired",
    );
    if (Number(lock.acquired) !== 1) throw Error('REFUSED: scanner busy');
    locked = true;
    const [[row]] = await db.execute(
      "SELECT * FROM user_integrations WHERE id=? AND provider='MICROSOFT'",
      [id],
    );
    if (
      !row ||
      row.status !== 'EXPIRED' ||
      row.connection_backend !== 'COMPOSIO' ||
      !row.connected_account_id ||
      row.remote_disconnect_pending
    )
      throw Error(
        'REFUSED: expected false-expired managed connection not found',
      );
    const [runs] = await db.execute(
      "SELECT * FROM email_import_runs WHERE integration_id=? AND firebase_id=? AND ((pull_state='RETRY' AND error_code='AUTH') OR (pull_state='PARTIAL' AND error_code='ACCESS' AND ?='EMAIL_CONNECTION_UNVERIFIED')) AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))",
      [id, row.firebase_id, row.last_sync_error],
    );
    if (runs.length !== 1)
      throw Error('REFUSED: exactly one unleased false-expiry run required');
    const run = runs[0];
    const {
      ComposioClientService,
    } = require('../dist/integrations/services/composio-client.service');
    const composio = new ComposioClientService();
    const account = {
      firebaseId: row.firebase_id,
      connectedAccountId: row.connected_account_id,
      environment: 'dev',
      toolkit: 'outlook',
    };
    const profile = await composio.execute(account, 'OUTLOOK_GET_PROFILE', {
      select: ['id', 'mail', 'userPrincipalName'],
    });
    if (profile.id !== row.account_id)
      throw Error('REFUSED: verified mailbox identity mismatch');
    console.log(
      JSON.stringify({
        mode: args.includes('--apply') ? 'apply' : 'inspect',
        integrationId: id,
        runId: run.id,
        identityVerified: true,
        remoteActiveVerified: true,
        previousAttempts: run.attempts,
        queryAndCursorPreserved: true,
        messageToolsExecuted: 0,
      }),
    );
    if (!args.includes('--apply')) return;
    await db.beginTransaction();
    transaction = true;
    const [connection] = await db.execute(
      "UPDATE user_integrations SET status='ACTIVE',last_sync_status='ERROR',last_sync_error='EMAIL_RETRY_PENDING',connection_verified_at=UTC_TIMESTAMP() WHERE id=? AND firebase_id=? AND connected_account_id=? AND status='EXPIRED' AND remote_disconnect_pending=0",
      [id, row.firebase_id, row.connected_account_id],
    );
    if (connection.affectedRows !== 1)
      throw Error('REFUSED: connection changed concurrently');
    const [updated] = await db.execute(
      "UPDATE email_import_runs SET pull_state='RETRY',error_code=NULL,attempts=0,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND),lease_token=NULL,lease_expires_at=NULL WHERE id=? AND integration_id=? AND firebase_id=? AND pull_state=? AND error_code=? AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))",
      [run.id, id, row.firebase_id, run.pull_state, run.error_code],
    );
    if (updated.affectedRows !== 1)
      throw Error('REFUSED: run changed concurrently');
    const [[after]] = await db.execute(
      'SELECT query_text,page_token FROM email_import_runs WHERE id=?',
      [run.id],
    );
    if (
      after.query_text !== run.query_text ||
      after.page_token !== run.page_token
    )
      throw Error('REFUSED: scan boundaries changed');
    await db.commit();
    transaction = false;
    console.log(
      JSON.stringify({
        recovered: true,
        integrationId: id,
        runId: run.id,
        queryAndCursorPreserved: true,
        noItemsOrDocumentsChanged: true,
        resumeDeferredSeconds: 120,
      }),
    );
  } finally {
    if (transaction) await db.rollback();
    if (locked)
      await db
        .query("SELECT RELEASE_LOCK('gmail-durable-scan')")
        .catch(() => {});
    await db.end();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      failed: true,
      code: e.category || e.code || e.name,
      safeReason: /^REFUSED:/.test(e.message) ? e.message : undefined,
    }),
  );
  process.exitCode = 1;
});
