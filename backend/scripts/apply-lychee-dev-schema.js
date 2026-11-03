// Explicit operator-run development migration. Never imports/boots Nest.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

async function main() {
  if (process.env.DB_DATABASE !== 'keepintax-dev') throw new Error('Development database required');
  const db = await mysql.createConnection({ host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, connectTimeout: 10000 });
  try {
    const [identity] = await db.query('SELECT DATABASE() AS db');
    if (identity[0].db !== 'keepintax-dev') throw new Error('Database identity mismatch');
    const [tables] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lychee_intake_events'");
    if (!tables.length) {
      await db.query(fs.readFileSync(path.join(__dirname, 'migrations/2026-10-25_lychee_intake.sql'), 'utf8'));
      console.log('Created lychee_intake_events in keepintax-dev');
    } else console.log('Table already exists; no DDL executed');
    const [columns] = await db.query('SHOW COLUMNS FROM lychee_intake_events');
    if (columns.length !== 22) throw new Error('Unexpected schema; review required');
    console.log('Verified development schema: 22 columns');
  } finally { await db.end(); }
}
main().catch(e => { console.error('Migration failed: ' + (e.code || e.message)); process.exitCode = 1; });
