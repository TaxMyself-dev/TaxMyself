// Runs 2026-07-13_phase3_schema.sql against keepintax_prodcopy. Raw mysql2,
// bypasses NestJS/TypeORM entirely (same safe pattern as the 2026-07-12
// incident recovery / catalog-migration-schema runner) so this can never
// trigger synchronize. Executes the whole file as one multi-statement query
// (not a naive semicolon-split) — the Phase 2.2 schema runner hit a bug
// splitting on `;\s*\n` that merged a leading comment block into the first
// CREATE TABLE and silently dropped it; passing the file verbatim with
// multipleStatements avoids that class of bug entirely.
//
// MODE=review (default): print current column state for the 4 target
//   tables, no write.
// MODE=apply: run the DDL file, then print column state again.
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const SQL_PATH = path.resolve(__dirname, '2026-07-13_phase3_schema.sql');

async function showColumns(conn, table, like) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [like]);
  return rows;
}

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE !== 'keepintax_prodcopy') {
    throw new Error(`Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}. Set DB_DATABASE=keepintax_prodcopy explicitly.`);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    multipleStatements: true,
  });

  console.log(`[phase3-schema] MODE=${MODE} against ${process.env.DB_DATABASE}`);

  console.log('[phase3-schema] BEFORE:');
  console.log(' expense.taxPercentSnapshot:', await showColumns(conn, 'expense', 'taxPercentSnapshot'));
  console.log(' expense.subCategoryId:', await showColumns(conn, 'expense', 'subCategoryId'));
  console.log(' supplier.subCategoryId:', await showColumns(conn, 'supplier', 'subCategoryId'));
  console.log(' classified_transactions.subCategoryId:', await showColumns(conn, 'classified_transactions', 'subCategoryId'));
  console.log(' extracted_document.sub_category_id:', await showColumns(conn, 'extracted_document', 'sub_category_id'));

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply to write). SQL file:', SQL_PATH);
    await conn.end();
    return;
  }

  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  await conn.query(sql);
  console.log('[phase3-schema] DDL applied.');

  console.log('[phase3-schema] AFTER:');
  console.log(' expense.taxPercentSnapshot:', await showColumns(conn, 'expense', 'taxPercentSnapshot'));
  console.log(' expense.subCategoryId:', await showColumns(conn, 'expense', 'subCategoryId'));
  console.log(' expense.approvalStatus:', await showColumns(conn, 'expense', 'approvalStatus'));
  console.log(' supplier.subCategoryId:', await showColumns(conn, 'supplier', 'subCategoryId'));
  console.log(' classified_transactions.subCategoryId:', await showColumns(conn, 'classified_transactions', 'subCategoryId'));
  console.log(' extracted_document.sub_category_id:', await showColumns(conn, 'extracted_document', 'sub_category_id'));
  console.log(' extracted_document.document_kind:', await showColumns(conn, 'extracted_document', 'document_kind'));

  const [[{ n: expenseCount }]] = await conn.query('SELECT COUNT(*) n FROM expense');
  console.log(`[phase3-schema] expense row count after DDL: ${expenseCount} (expect 85 per D14 — a pure schema ALTER never changes row count)`);

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
