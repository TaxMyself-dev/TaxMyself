// Fixed DEV-only schema tool. No Nest bootstrap, provider calls or data migration.
const fs = require('node:fs');
const path = require('node:path');
const SQL =
  'ALTER TABLE email_import_runs\n  ADD COLUMN worker_scope VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,\n  ADD INDEX ix_email_runs_scope_due (worker_scope,pull_state,next_attempt_at,started_at),\n  ALGORITHM=INPLACE, LOCK=NONE';
function validateMetadata(columns, index) {
  if (!columns.length && !index.length) return [SQL];
  if (columns.length !== 1)
    throw Error('REFUSED: unexpected worker_scope column');
  const c = columns[0];
  if (
    c.DATA_TYPE !== 'varchar' ||
    Number(c.CHARACTER_MAXIMUM_LENGTH) !== 16 ||
    c.CHARACTER_SET_NAME !== 'ascii' ||
    c.COLLATION_NAME !== 'ascii_bin' ||
    c.IS_NULLABLE !== 'YES' ||
    c.COLUMN_DEFAULT !== null
  )
    throw Error('REFUSED: incompatible worker_scope column');
  if (
    index.length !== 4 ||
    index.map((x) => x.COLUMN_NAME).join(',') !==
      'worker_scope,pull_state,next_attempt_at,started_at' ||
    index.some((x) => Number(x.NON_UNIQUE) !== 1 || x.SUB_PART !== null)
  )
    throw Error('REFUSED: incompatible scope index');
  return [];
}
async function inspect(db) {
  const [[identity]] = await db.query(
    'SELECT DATABASE() AS db, VERSION() AS version',
  );
  if (identity.db !== 'keepintax-dev')
    throw Error('REFUSED: exact DEV database required');
  const [[table]] = await db.query(
    "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_import_runs'",
  );
  if (table?.ENGINE !== 'InnoDB')
    throw Error('REFUSED: existing InnoDB intake schema required');
  const [columns] = await db.query(
    "SELECT DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,CHARACTER_SET_NAME,COLLATION_NAME,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_import_runs' AND COLUMN_NAME='worker_scope'",
  );
  const [index] = await db.query(
    "SELECT COLUMN_NAME,NON_UNIQUE,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_import_runs' AND INDEX_NAME='ix_email_runs_scope_due' ORDER BY SEQ_IN_INDEX",
  );
  const plan = validateMetadata(columns, index);
  const [[counts]] = await db.query(
    "SELECT COUNT(*) AS runCount,COALESCE(SUM(pull_state IN ('RUNNING','RETRY') OR (pull_state='COMPLETE' AND sync_type<>'MANUAL' AND integration_finalized_at IS NULL)),0) AS pendingPulls FROM email_import_runs",
  );
  return {
    database: identity.db,
    mysqlVersion: identity.version,
    runCount: Number(counts.runCount),
    pendingPulls: Number(counts.pendingPulls),
    plan,
  };
}
function assertDevConfig(cfg) {
  if (
    cfg.DB_DATABASE !== 'keepintax-dev' ||
    cfg.DISABLE_SYNCHRONIZE !== 'true' ||
    cfg.COMPOSIO_ENVIRONMENT !== 'dev'
  )
    throw Error('REFUSED: only explicit safe DEV settings authorized');
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((x) => x !== '--apply'))
    throw Error('REFUSED: unsupported argument');
  const cfg = require('dotenv').parse(
    fs.readFileSync(path.join(__dirname, '../.env')),
  );
  assertDevConfig(cfg);
  const recorded = fs
    .readFileSync(
      path.join(__dirname, '../../docs/features/email-worker-scope.sql'),
      'utf8',
    )
    .split(/\r?\n/)
    .filter((x) => !x.trim().startsWith('--'))
    .join('\n')
    .trim()
    .replace(/;$/, '');
  if (recorded !== SQL) throw Error('REFUSED: prepared SQL differs');
  const db = await require('mysql2/promise').createConnection({
    host: cfg.DB_HOST,
    port: Number(cfg.DB_PORT || 3306),
    user: cfg.DB_USERNAME,
    password: cfg.DB_PASSWORD,
    database: 'keepintax-dev',
    connectTimeout: 10000,
    multipleStatements: false,
  });
  let held = false;
  try {
    if (args.includes('--apply')) {
      const [[lock]] = await db.query(
        "SELECT GET_LOCK('gmail-durable-scan',5) AS acquired",
      );
      if (Number(lock.acquired) !== 1) throw Error('REFUSED: scanner busy');
      held = true;
      await db.query('SET SESSION lock_wait_timeout=10');
    }
    const before = await inspect(db);
    console.log(
      JSON.stringify({
        mode: args.includes('--apply') ? 'apply' : 'inspect',
        ...before,
      }),
    );
    if (!args.includes('--apply')) return;
    if (before.pendingPulls)
      throw Error(
        'REFUSED: active pulls exist; no existing-work migration authorized',
      );
    for (const ddl of before.plan) await db.query(ddl);
    const after = await inspect(db);
    if (after.plan.length) throw Error('REFUSED: schema verification failed');
    console.log(
      JSON.stringify({
        verified: true,
        ddlStatementsApplied: before.plan.length,
        ...after,
      }),
    );
  } finally {
    if (held)
      await db
        .query("SELECT RELEASE_LOCK('gmail-durable-scan')")
        .catch(() => {});
    await db.end();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      JSON.stringify({
        failed: true,
        code: e.code || e.name,
        reason: /^REFUSED:/.test(e.message) ? e.message : undefined,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { SQL, inspect, validateMetadata, assertDevConfig };
