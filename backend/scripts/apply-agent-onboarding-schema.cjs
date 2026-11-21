'use strict';
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
const { developmentOptions, TABLES } = require('./onboarding-test-target.cjs');
require('dotenv').config({ path: join(__dirname, '../.env'), quiet: true });
async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== '--database=keepintax-dev' ||
    !['--check', '--apply'].includes(args[1])
  )
    throw new Error(
      'Use --database=keepintax-dev followed by --check or --apply',
    );
  // The explicit CLI target is the approval acknowledgment. Environment must independently match it.
  const config = developmentOptions({
    ...process.env,
    ONBOARDING_APPROVED_DATABASE: 'keepintax-dev',
  });
  const raw = readFileSync(
    join(__dirname, 'migrations/2026-11-19_agent_onboarding.sql'),
    'utf8',
  );
  const statements = raw
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const names = statements.map(
    (s) =>
      /^CREATE TABLE IF NOT EXISTS (agent_onboarding_[a-z_]+)\s*\(/.exec(
        s,
      )?.[1],
  );
  if (statements.length !== 5 || names.some((n, i) => n !== TABLES[i]))
    throw new Error('ONBOARDING_SCHEMA_NOT_ALLOWLISTED');
  const { username, ...connectionConfig } = config;
  const conn = await mysql.createConnection({
    ...connectionConfig,
    user: username,
    multipleStatements: false,
    charset: 'utf8mb4',
  });
  try {
    const [identity] = await conn.query(
      'SELECT DATABASE() AS selected_database, VERSION() AS version',
    );
    if (identity[0].selected_database !== 'keepintax-dev')
      throw new Error('ONBOARDING_CONNECTED_DATABASE_MISMATCH');
    const [before] = await conn.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (${TABLES.map(
        () => '?',
      ).join(',')})`,
      TABLES,
    );
    console.log(
      JSON.stringify({
        database: identity[0].selected_database,
        mysql: identity[0].version,
        existingOnboardingTables: before.length,
        schemaSha256: createHash('sha256').update(raw).digest('hex'),
        mode: args[1],
      }),
    );
    if (args[1] === '--check') return;
    for (const statement of statements) await conn.query(statement);
    const [columns] = await conn.query(
      `SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (${TABLES.map(
        () => '?',
      ).join(',')})`,
      TABLES,
    );
    for (let i = 0; i < statements.length; i++) {
      const body = statements[i].slice(statements[i].indexOf('(') + 1);
      const expected = [
        ...body.matchAll(
          /(?:^|,)\s*([a-z_][a-z_0-9]*)\s+(CHAR|VARCHAR|TEXT|MEDIUMTEXT|INT|JSON|DATETIME)\b/gi,
        ),
      ].map((m) => ({ name: m[1], type: m[2].toLowerCase() }));
      const actual = columns.filter(
        (c) => c.TABLE_NAME === TABLES[i] || c.table_name === TABLES[i],
      );
      for (const column of expected)
        if (
          !actual.some(
            (c) =>
              (c.COLUMN_NAME ?? c.column_name) === column.name &&
              (c.DATA_TYPE ?? c.data_type) === column.type,
          )
        )
          throw new Error('ONBOARDING_SCHEMA_COLUMN_MISMATCH');
      if (actual.length !== expected.length)
        throw new Error('ONBOARDING_SCHEMA_COLUMN_COUNT_MISMATCH');
      console.log(
        JSON.stringify({ table: TABLES[i], verifiedColumns: actual.length }),
      );
    }
    console.log('ONBOARDING_SCHEMA_APPLIED_AND_VERIFIED');
  } finally {
    await conn.end();
  }
}
main().catch((error) => {
  console.error(error.code || error.message || 'ONBOARDING_SCHEMA_FAILED');
  process.exitCode = 1;
});
