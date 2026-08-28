// Adds the archive soft-delete timestamp to extracted_document.
//
// MODE=review (default): reports whether the column exists; writes nothing.
// MODE=apply CONFIRM=yes: adds it when missing, then verifies the result.
// Target is deliberately restricted to keepintax-dev. Production uses the
// SQL appended to docs/redesign/cutover.sql and is applied manually.
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const SQL_PATH = path.resolve(__dirname, '2026-08-28_add-extracted-document-deleted-at.sql');

async function columnExists(conn) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'extracted_document'
        AND COLUMN_NAME = 'deleted_at'
        AND DATA_TYPE = 'datetime'
        AND IS_NULLABLE = 'YES'`,
  );
  return Number(rows[0].n) === 1;
}

async function main() {
  if (process.env.DB_DATABASE !== 'keepintax-dev') {
    throw new Error(`Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}; expected keepintax-dev.`);
  }
  if (MODE === 'apply' && process.env.CONFIRM !== 'yes') {
    throw new Error('MODE=apply requires CONFIRM=yes — refusing to write without explicit confirmation.');
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const before = await columnExists(conn);
  console.log(`[extracted-document-deleted-at] MODE=${MODE}; column exists=${before}`);
  if (MODE === 'apply' && !before) {
    await conn.query(fs.readFileSync(SQL_PATH, 'utf8'));
  }

  const after = await columnExists(conn);
  console.log(`[extracted-document-deleted-at] verification: column exists=${after}`);
  await conn.end();

  if (MODE === 'apply' && !after) {
    throw new Error('deleted_at was not found after applying the migration.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
