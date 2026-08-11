// Form 6111 reference-card project, Steps 1-2 (2026-08-11) — adds
// booking_account.formPart and backfills it on the existing ~69 SYSTEM
// cards. Independent of the categories-redesign master plan (docs/redesign/)
// — not one of its D1-D15 decisions.
//
// Raw mysql2, bypasses NestJS/TypeORM entirely so this can never race with
// (or be silently pre-empted by) `synchronize` — same pattern as
// 2026-07-13_run-phase3-schema.js. `formPart` is also declared on the
// BookingAccount entity (account.entity.ts) so the ORM model matches once
// this has run; synchronize is NOT relied on to create the column.
//
// Step 1 (DDL): runs 2026-08-11_add-form-part-to-booking-account.sql,
//   skipped if the column already exists (idempotent).
// Step 2 (backfill), in this exact order (later UPDATEs override earlier
//   ones on purpose):
//   1. formPart='A' for every SYSTEM row with reportScope='pnl' (covers
//      both income accounts and operating expense accounts).
//   2. formPart='C' override for the 9 balance-sheet accounts (bank/cash/
//      A-R/A-P/VAT clearing) — these also have reportScope='pnl' today, so
//      step 1 would otherwise mislabel them as Part A.
//   3. formPart='B' override for code 61340 (תרומות מוכרות) specifically —
//      it's reportScope=ANNUAL like its four siblings (61350-61380), but
//      unlike them it IS placed on Form 6111 (Part B), so it needs an
//      explicit correction after the blanket passes.
//   Everything else (90000-range technical accounts, 61350-61380 personal
//   deductions) is intentionally left formPart=NULL — not part of Form 6111.
//
// MODE=review (default): prints column-exists check + a preview of what the
//   backfill WOULD change (grouped counts), writes NOTHING.
// MODE=apply CONFIRM=yes: runs the DDL (if needed) + the three UPDATEs,
//   then prints the full per-account verification table.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   npx ts-node -r tsconfig-paths/register scripts/migrations/2026-08-11_add-form-part-to-booking-account.js
//   (add MODE=apply CONFIRM=yes to actually write — works fine as plain node too, no ts-node needed for a .js file)
//
//   node scripts/migrations/2026-08-11_add-form-part-to-booking-account.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-11_add-form-part-to-booking-account.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const SQL_PATH = path.resolve(__dirname, '2026-08-11_add-form-part-to-booking-account.sql');

const BALANCE_CODES = ['1000', '1100', '1110', '1120', '1200', '2000', '2100', '2400', '2410'];

async function columnExists(conn) {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_account' AND COLUMN_NAME = 'formPart'`,
  );
  return rows.length > 0;
}

async function verificationTable(conn) {
  const [rows] = await conn.query(
    `SELECT code, name, formPart, reportScope, code6111 FROM booking_account
     WHERE chartOwnerKey='SYSTEM' ORDER BY CAST(code AS UNSIGNED)`,
  );
  return rows;
}

async function main() {
  if (process.env.DB_DATABASE !== 'keepintax-dev') {
    throw new Error(
      `Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}. ` +
        `Set DB_DATABASE=keepintax-dev explicitly before running this script.`,
    );
  }
  if (MODE === 'apply' && process.env.CONFIRM !== 'yes') {
    throw new Error('MODE=apply requires CONFIRM=yes — refusing to write without explicit confirmation.');
  }
  console.log(`[form-part-backfill] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    multipleStatements: true,
  });

  const hasColumn = await columnExists(conn);
  console.log(`[form-part-backfill] booking_account.formPart exists: ${hasColumn}`);

  if (MODE === 'review') {
    if (!hasColumn) {
      console.log('\n(dry run — column not yet added. Preview of the backfill logic:)');
    }
    const [pnlPreview] = await conn.query(
      `SELECT code, name, reportScope FROM booking_account WHERE chartOwnerKey='SYSTEM' AND reportScope='pnl' ORDER BY CAST(code AS UNSIGNED)`,
    );
    console.log(`\n[review] SYSTEM rows with reportScope='pnl' (would get formPart='A', then the ${BALANCE_CODES.length} balance codes below overridden to 'C'): ${pnlPreview.length} rows`);
    console.table(pnlPreview);
    console.log(`\n[review] Balance-sheet codes to override to formPart='C': ${BALANCE_CODES.join(', ')}`);
    console.log(`[review] Code 61340 to override to formPart='B'.`);
    console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
    await conn.end();
    return;
  }

  if (!hasColumn) {
    console.log('[form-part-backfill] Applying DDL:', SQL_PATH);
    const sql = fs.readFileSync(SQL_PATH, 'utf8');
    await conn.query(sql);
    console.log('[form-part-backfill] Column added.');
  } else {
    console.log('[form-part-backfill] Column already exists — skipping DDL.');
  }

  const [r1] = await conn.query(`UPDATE booking_account SET formPart = 'A' WHERE chartOwnerKey = 'SYSTEM' AND reportScope = 'pnl'`);
  console.log(`[form-part-backfill] Step 2.1 (formPart='A' for reportScope='pnl'): ${r1.affectedRows} rows`);

  const [r2] = await conn.query(
    `UPDATE booking_account SET formPart = 'C' WHERE chartOwnerKey = 'SYSTEM' AND code IN (?)`,
    [BALANCE_CODES],
  );
  console.log(`[form-part-backfill] Step 2.2 (formPart='C' override for balance codes): ${r2.affectedRows} rows`);

  const [r3] = await conn.query(`UPDATE booking_account SET formPart = 'B' WHERE chartOwnerKey = 'SYSTEM' AND code = '61340'`);
  console.log(`[form-part-backfill] Step 2.3 (formPart='B' override for 61340): ${r3.affectedRows} rows`);

  console.log('\n[form-part-backfill] Verification — full SYSTEM chart:');
  console.table(await verificationTable(conn));

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
