// Form 6111 category/sub-category project, schema step (2026-08-14) — adds
// booking_account.category6111/subCategory6111. Independent of the
// categories-redesign master plan (docs/redesign/) — not one of its D1-D15
// decisions.
//
// Raw mysql2, bypasses NestJS/TypeORM entirely so this can never race with
// (or be silently pre-empted by) `synchronize` — same pattern as
// 2026-08-11_add-form-part-to-booking-account.js. Both columns are also
// declared on the BookingAccount entity (account.entity.ts) so the ORM
// model matches once this has run; synchronize is NOT relied on to create
// them.
//
// DDL only — no backfill here. See 2026-08-14_backfill-category6111-on-
// reference-rows.js and 2026-08-14_backfill-category6111-on-operational-rows.js
// for the two data steps that follow this one.
//
// MODE=review (default): prints column-exists check, writes NOTHING.
// MODE=apply CONFIRM=yes: runs the DDL (skipped if columns already exist).
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-14_add-category6111-columns-to-booking-account.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-14_add-category6111-columns-to-booking-account.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const SQL_PATH = path.resolve(__dirname, '2026-08-14_add-category6111-columns-to-booking-account.sql');

async function columnsExist(conn) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_account' AND COLUMN_NAME IN ('category6111', 'subCategory6111')`,
  );
  return rows.map((r) => r.COLUMN_NAME);
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
  console.log(`[category6111-columns] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    multipleStatements: true,
  });

  const existing = await columnsExist(conn);
  console.log(`[category6111-columns] Existing columns found: ${existing.length ? existing.join(', ') : '(none)'}`);

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
    await conn.end();
    return;
  }

  if (existing.length === 2) {
    console.log('[category6111-columns] Both columns already exist — skipping DDL.');
  } else if (existing.length === 0) {
    console.log('[category6111-columns] Applying DDL:', SQL_PATH);
    await conn.query(fs.readFileSync(SQL_PATH, 'utf8'));
    console.log('[category6111-columns] Columns added.');
  } else {
    console.error(`[category6111-columns] ❌ Partial state: only ${existing.join(', ')} exists — refusing to run the combined ALTER. Review manually.`);
    await conn.end();
    process.exit(1);
  }

  const after = await columnsExist(conn);
  console.log('[category6111-columns] Verification — columns present:', after.join(', '));

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
