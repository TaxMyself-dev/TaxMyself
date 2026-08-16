// Phase 3, Step 1 (2026-08-17) — converts business.businessField from a
// freeform varchar to a controlled enum ('SERVICE_PROVIDER'/'COMMERCIAL'/
// 'CONTRACTOR'), backfilling every existing row to SERVICE_PROVIDER first.
// Foundational field only — no catalog/chartOwnerKey scoping reads this
// column; that's a separate, later Phase 3 step (not touched here).
//
// Raw mysql2, bypasses NestJS/TypeORM entirely — same pattern as every
// other DDL/bulk-write script in this folder. The entity
// (business.entity.ts) already declares the enum column so the ORM model
// matches once this has run; synchronize is NOT relied on for the ALTER.
//
// Order matters: backfill the DATA first while the column is still varchar
// (so there's zero risk of MySQL's enum-coercion behavior silently
// truncating an unexpected value to ''), verify every row is exactly
// 'SERVICE_PROVIDER', THEN alter the column type. DDL is not transactional
// in MySQL (implicit commit), so the two steps are deliberately sequenced
// with a hard verification gate between them rather than wrapped in one
// transaction.
//
// Also closes a real seed-vs-schema conflict found during this step's
// planning: 5-9 demo-data profile fixtures write freeform Hebrew text into
// this column (e.g. 'תיקון מחשבים', 'ייעוץ עסקי') — those literals are
// updated to 'SERVICE_PROVIDER' in the same commit as this script, so a
// re-seed after this migration runs doesn't try to insert an invalid enum
// value.
//
// MODE=review (default): backfill UPDATE runs inside a transaction to get
//   an exact preview, then ALWAYS rolls back — no ALTER, writes NOTHING.
// MODE=apply CONFIRM=yes: runs the backfill, verifies every row is
//   SERVICE_PROVIDER, commits, then runs the ALTER TABLE.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-17_convert-business-field-to-enum.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-17_convert-business-field-to-enum.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const TARGET_VALUE = 'SERVICE_PROVIDER';

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
  console.log(`[business-field-enum] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [beforeDist] = await conn.query(
    `SELECT businessField, COUNT(*) n FROM business GROUP BY businessField ORDER BY n DESC`,
  );
  console.log('\n[business-field-enum] Before — businessField distribution:');
  console.table(beforeDist);

  await conn.beginTransaction();
  try {
    const [result] = await conn.query(
      `UPDATE business SET businessField = ? WHERE businessField IS NULL OR businessField != ?`,
      [TARGET_VALUE, TARGET_VALUE],
    );
    console.log(`\n[business-field-enum] Rows updated to '${TARGET_VALUE}': ${result.affectedRows}`);

    if (MODE === 'review') {
      await conn.rollback();
      console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
      await conn.end();
      return;
    }

    // Guard on final state, not the delta — must be exactly TARGET_VALUE
    // for every row before committing.
    const [[{ total }]] = await conn.query(`SELECT COUNT(*) total FROM business`);
    const [[{ matching }]] = await conn.query(`SELECT COUNT(*) matching FROM business WHERE businessField = ?`, [TARGET_VALUE]);
    if (Number(matching) !== Number(total)) {
      await conn.rollback();
      console.error(
        `\n[business-field-enum] ❌ Refusing to commit: ${matching}/${total} rows are '${TARGET_VALUE}' — expected all ${total}. Rolled back.`,
      );
      await conn.end();
      process.exit(1);
    }
    console.log(`[business-field-enum] Verified: all ${total} rows = '${TARGET_VALUE}' — committing backfill.`);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('[business-field-enum] Error during backfill — transaction rolled back.');
    await conn.end();
    throw err;
  }

  // DDL — not transactional, run only after the backfill is committed and
  // verified above. Nullable + a DB-level default, matching the sibling
  // businessType/vatReportingType/taxReportingType columns' own convention
  // (their defaults are effectively decorative — the app's own create path
  // always writes an explicit value or null — but matching the pattern
  // keeps this column consistent with its neighbors).
  console.log('\n[business-field-enum] Applying ALTER TABLE...');
  await conn.query(
    `ALTER TABLE business
     MODIFY COLUMN businessField ENUM('SERVICE_PROVIDER','COMMERCIAL','CONTRACTOR')
     DEFAULT 'SERVICE_PROVIDER' NULL`,
  );
  console.log('[business-field-enum] Column converted to ENUM.');

  const [afterDist] = await conn.query(
    `SELECT businessField, COUNT(*) n FROM business GROUP BY businessField ORDER BY n DESC`,
  );
  console.log('\n[business-field-enum] After — businessField distribution:');
  console.table(afterDist);

  const [[createTable]] = await conn.query(`SHOW CREATE TABLE business`);
  const columnLine = createTable['Create Table'].split('\n').find((l) => l.includes('businessField'));
  console.log('\n[business-field-enum] Column definition now:', columnLine.trim());

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
