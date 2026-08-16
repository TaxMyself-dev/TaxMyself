// Phase 3, Step 3 (2026-08-17, revised model) — adds
// booking_account.visibleBusinessTypes, a MySQL SET column ('SERVICE_
// PROVIDER'/'COMMERCIAL'/'CONTRACTOR'). This is a VISIBILITY FILTER on a
// card, independent of chartOwnerKey/ownerType (ownership stays
// SYSTEM/ACCOUNTANT/CLIENT, unchanged) — a business sees a card only if
// BOTH its chartOwnerKey is in chartOwnerKeysFor(ctx) AND the business's
// businessField is in the card's visibleBusinessTypes. Empty SET = visible
// to nobody (opt-in per type, not opt-out) — see catalog.service.ts's
// getMerged* methods for where this is enforced.
//
// Backfill: every currently isActive=true row (the 68 operational cards) is
// backfilled to ALL THREE types, as a temporary safe default that makes this
// filter a no-op for existing data — preserves today's "everyone sees
// everything" behavior through the rollout. This is explicitly NOT a
// curation decision; it's a placeholder until the pending accountant
// mapping review narrows individual cards via the admin UI (Phase 3 Step 4).
// The 321 isActive=false Form 6111 reference rows are left EMPTY — they are
// not visible to anyone regardless of type until activated, and the
// activate dialog requires the admin to pick at least one type at that
// point (empty is rejected there — see ActivateBookingAccountDto).
//
// Raw mysql2, bypasses NestJS/TypeORM entirely — same pattern as every
// other DDL/bulk-write script in this folder. The entity (account.entity.ts)
// already declares the SET column so the ORM model matches once this has
// run; synchronize is NOT relied on for the ALTER.
//
// MODE=review (default): backfill UPDATE runs inside a transaction to get
//   an exact preview, then ALWAYS rolls back — no ALTER, writes NOTHING.
// MODE=apply CONFIRM=yes: runs the ALTER (skipped if column already exists),
//   then the backfill, verifies, commits.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-17_add-visible-business-types-to-booking-account.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-17_add-visible-business-types-to-booking-account.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const ALL_TYPES = 'SERVICE_PROVIDER,COMMERCIAL,CONTRACTOR';

async function columnExists(conn) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_account' AND COLUMN_NAME = 'visibleBusinessTypes'`,
  );
  return rows.length > 0;
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
  console.log(`[visible-business-types] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const existedBefore = await columnExists(conn);
  console.log(`[visible-business-types] Column already exists: ${existedBefore}`);

  const [[{ activeCount }]] = await conn.query(`SELECT COUNT(*) activeCount FROM booking_account WHERE isActive = 1`);
  const [[{ inactiveCount }]] = await conn.query(`SELECT COUNT(*) inactiveCount FROM booking_account WHERE isActive = 0`);
  console.log(`[visible-business-types] Before — isActive=1 rows: ${activeCount}, isActive=0 rows: ${inactiveCount}`);

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
    await conn.end();
    return;
  }

  if (existedBefore) {
    console.log('[visible-business-types] Column already exists — skipping DDL.');
  } else {
    console.log('[visible-business-types] Applying ALTER TABLE...');
    await conn.query(
      `ALTER TABLE booking_account
       ADD COLUMN visibleBusinessTypes SET('SERVICE_PROVIDER','COMMERCIAL','CONTRACTOR') NOT NULL DEFAULT ''`,
    );
    console.log('[visible-business-types] Column added (default empty — visible to nobody).');
  }

  await conn.beginTransaction();
  try {
    const [result] = await conn.query(
      `UPDATE booking_account SET visibleBusinessTypes = ? WHERE isActive = 1 AND visibleBusinessTypes != ?`,
      [ALL_TYPES, ALL_TYPES],
    );
    console.log(`\n[visible-business-types] isActive=1 rows backfilled to all 3 types: ${result.affectedRows}`);

    // Guard on final state, not the delta.
    const [[{ activeMatching }]] = await conn.query(
      `SELECT COUNT(*) activeMatching FROM booking_account WHERE isActive = 1 AND visibleBusinessTypes = ?`,
      [ALL_TYPES],
    );
    const [[{ inactiveNonEmpty }]] = await conn.query(
      `SELECT COUNT(*) inactiveNonEmpty FROM booking_account WHERE isActive = 0 AND visibleBusinessTypes != ''`,
    );
    if (Number(activeMatching) !== Number(activeCount)) {
      await conn.rollback();
      console.error(
        `\n[visible-business-types] ❌ Refusing to commit: ${activeMatching}/${activeCount} active rows have all 3 types — expected all ${activeCount}. Rolled back.`,
      );
      await conn.end();
      process.exit(1);
    }
    if (Number(inactiveNonEmpty) !== 0) {
      await conn.rollback();
      console.error(
        `\n[visible-business-types] ❌ Refusing to commit: ${inactiveNonEmpty} inactive (reference) rows have non-empty visibleBusinessTypes — expected 0. Rolled back.`,
      );
      await conn.end();
      process.exit(1);
    }
    console.log(`[visible-business-types] Verified: all ${activeCount} active rows = all 3 types, all ${inactiveCount} inactive rows = empty. Committing.`);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('[visible-business-types] Error during backfill — transaction rolled back.');
    await conn.end();
    throw err;
  }

  const [afterDist] = await conn.query(
    `SELECT isActive, visibleBusinessTypes, COUNT(*) n FROM booking_account GROUP BY isActive, visibleBusinessTypes ORDER BY isActive DESC, n DESC`,
  );
  console.log('\n[visible-business-types] After — (isActive, visibleBusinessTypes) distribution:');
  console.table(afterDist);

  const [[createTable]] = await conn.query(`SHOW CREATE TABLE booking_account`);
  const columnLine = createTable['Create Table'].split('\n').find((l) => l.includes('visibleBusinessTypes'));
  console.log('\n[visible-business-types] Column definition now:', columnLine.trim());

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
