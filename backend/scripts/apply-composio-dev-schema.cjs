// Explicit DEV-only schema maintenance. Never boots Nest or contacts Composio.
// Default: inspect/plan only. --apply executes additive missing DDL after preflight.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const definitions = {
  user_integrations: {
    connection_backend: ['VARCHAR(32) NULL', 'varchar', 32, 'YES'],
    connected_account_id: ['VARCHAR(255) NULL', 'varchar', 255, 'YES'],
    connection_verified_at: ['DATETIME NULL', 'datetime', null, 'YES'],
    remote_disconnect_pending: ['TINYINT(1) NOT NULL DEFAULT 0', 'tinyint', null, 'NO'],
    retired_connected_account_ids: ['JSON NULL', 'json', null, 'YES'],
  },
  oauth_states: {
    connected_account_id: ['VARCHAR(255) NULL', 'varchar', 255, 'YES'],
    target_integration_id: ['INT NULL', 'int', null, 'YES'],
  },
};
const indexName = 'ux_user_integrations_connected_account';

async function inspect(db) {
  const [[identity]] = await db.query('SELECT DATABASE() AS db, VERSION() AS version');
  if (identity.db !== 'keepintax-dev') throw new Error('REFUSED: database identity mismatch');
  const [columns] = await db.query("SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('user_integrations','oauth_states')");
  const [indexes] = await db.query("SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_integrations' AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX", [indexName]);
  const plan = [];
  for (const [table, fields] of Object.entries(definitions)) {
    if (!columns.some(column => column.TABLE_NAME === table && column.COLUMN_NAME === 'id')) throw new Error(`REFUSED: baseline table missing: ${table}`);
    const additions = [];
    for (const [name, [sql, type, length, nullable]] of Object.entries(fields)) {
      const column = columns.find(item => item.TABLE_NAME === table && item.COLUMN_NAME === name);
      if (!column) { additions.push(`ADD COLUMN \`${name}\` ${sql}`); continue; }
      if (column.DATA_TYPE !== type || column.IS_NULLABLE !== nullable || (length && Number(column.CHARACTER_MAXIMUM_LENGTH) !== length) || (name === 'remote_disconnect_pending' && String(column.COLUMN_DEFAULT) !== '0')) throw new Error(`REFUSED: existing column differs: ${table}.${name}`);
    }
    if (table === 'user_integrations') {
      if (indexes.length && (indexes.length !== 1 || Number(indexes[0].NON_UNIQUE) !== 0 || indexes[0].COLUMN_NAME !== 'connected_account_id')) throw new Error('REFUSED: existing index differs');
      if (!indexes.length) {
        if (columns.some(column => column.TABLE_NAME === table && column.COLUMN_NAME === 'connected_account_id')) {
          const [duplicates] = await db.query('SELECT 1 FROM user_integrations WHERE connected_account_id IS NOT NULL GROUP BY connected_account_id HAVING COUNT(*) > 1 LIMIT 1');
          if (duplicates.length) throw new Error('REFUSED: duplicate connection pointers; no data modified');
        }
        additions.push(`ADD UNIQUE INDEX \`${indexName}\` (\`connected_account_id\`)`);
      }
    }
    if (additions.length) plan.push(`ALTER TABLE \`${table}\` ${additions.join(', ')}`);
  }
  return { database: identity.db, mysqlVersion: identity.version, plan };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) throw new Error('REFUSED: unsupported argument');
  // Fixed local .env, no ambient database overrides or command-line destinations.
  const cfg = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env')));
  if (cfg.DB_DATABASE !== 'keepintax-dev') throw new Error('REFUSED: only keepintax-dev is authorized');
  const db = await mysql.createConnection({ host: cfg.DB_HOST, port: Number(cfg.DB_PORT || 3306), user: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: 'keepintax-dev', connectTimeout: 10000, multipleStatements: false });
  let locked = false;
  try {
    if (args.includes('--apply')) {
      const [[lock]] = await db.query("SELECT GET_LOCK('keepintax-dev:composio-schema', 10) AS acquired");
      if (Number(lock.acquired) !== 1) throw new Error('REFUSED: schema maintenance lock unavailable');
      locked = true;
      await db.query('SET SESSION lock_wait_timeout = 10');
    }
    const before = await inspect(db);
    console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'inspect', ...before }, null, 2));
    if (!args.includes('--apply')) return;
    // MySQL DDL commits implicitly. Additions are rerunnable after a partial failure.
    for (const sql of before.plan) await db.query(sql);
    const after = await inspect(db);
    if (after.plan.length) throw new Error('Verification failed: schema additions remain');
    console.log(JSON.stringify({ verified: true, database: after.database, ddlStatementsApplied: before.plan.length, expectedColumns: 7, uniqueIndexVerified: true }));
  } finally {
    if (locked) await db.query("SELECT RELEASE_LOCK('keepintax-dev:composio-schema')").catch(() => {});
    await db.end();
  }
}

if (require.main === module) main().catch(error => {
  // Do not print database errors containing connection options or credentials.
  console.error('DEV schema operation failed: ' + (error.code || (/^(REFUSED:|Verification failed:)/.test(error.message) ? error.message : 'unexpected error')));
  process.exitCode = 1;
});
module.exports = { inspect };
