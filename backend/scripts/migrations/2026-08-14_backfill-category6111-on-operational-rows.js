// Form 6111 category/sub-category project, Step 3 (2026-08-14) — backfills
// booking_account.category6111/subCategory6111 on the 59 operational
// (non-'6111-%') SYSTEM rows that 2026-08-14_backfill-operational-code6111.js
// gave a code6111 to. Independent of the categories-redesign master plan
// (docs/redesign/) — not one of its D1-D15 decisions.
//
// Unlike Step 2 (one CSV row -> one reference row, matched by internalCode),
// this is a fan-out: multiple operational rows share the same code6111
// (e.g. 60210/60230/60240/60250/60260 all -> 3566), and ALL of them
// correctly get the identical official category6111/subCategory6111 — the
// official identity is per 6111-code, not per operational card. So this
// looks up each DISTINCT code6111 value currently set on operational rows
// against the CSV's own `code6111` column (not internalCode), and applies
// the match to every operational row sharing that value in one UPDATE.
//
// Defensive guard (the request's own edge case, generalized): for every
// code6111 value in play, there must be EXACTLY ONE CSV row with that
// code6111 (code 2570 is the one known duplicate in the CSV as a whole, but
// no operational row maps to it — this check verifies that stays true and
// catches any other surprise). Zero or >1 matches for any code6111 value
// actually in use STOPS the whole run rather than picking one arbitrarily.
//
// Raw mysql2, bypasses NestJS/TypeORM entirely so this can never race with
// `synchronize`.
//
// Safety: every UPDATE carries `AND category6111 IS NULL`, so this is safe
// to re-run. Runs inside one transaction; refuses (rolls back) unless the
// total is exactly 59 (matching the 59 rows Step A gave a code6111 to).
//
// MODE=review (default): runs the UPDATEs inside a transaction for an exact
//   preview, then ALWAYS rolls back.
// MODE=apply CONFIRM=yes: runs the UPDATEs, checks the total is exactly 59,
//   commits if so, otherwise rolls back and exits non-zero.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-14_backfill-category6111-on-operational-rows.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-14_backfill-category6111-on-operational-rows.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const CSV_PATH = path.resolve(__dirname, '..', '..', '..', 'tax_authority_6111_full.csv');
const EXPECTED_COUNT = 59;

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function loadCsvByCode6111() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const idx = {
    code6111: header.indexOf('code6111'),
    category: header.indexOf('category'),
    subcategory: header.indexOf('subcategory'),
  };
  for (const [key, i] of Object.entries(idx)) {
    if (i === -1) throw new Error(`CSV missing expected column: ${key}`);
  }
  const byCode6111 = new Map();
  for (let n = 0; n < lines.length - 1; n++) {
    const f = parseCsvLine(lines[n + 1]);
    const code6111 = f[idx.code6111].trim();
    const category = f[idx.category].trim();
    const subcategory = f[idx.subcategory].trim();
    if (!code6111) continue;
    if (!byCode6111.has(code6111)) byCode6111.set(code6111, []);
    byCode6111.get(code6111).push({ category, subcategory: subcategory || null });
  }
  return byCode6111;
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
  console.log(`[operational-category6111-backfill] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const csvByCode6111 = loadCsvByCode6111();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [distinctRows] = await conn.query(
    `SELECT DISTINCT code6111 FROM booking_account
     WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND code6111 IS NOT NULL`,
  );
  const distinctCode6111Values = distinctRows.map((r) => r.code6111);
  console.log(`[operational-category6111-backfill] Distinct code6111 values in use on operational rows: ${distinctCode6111Values.length}`);

  // Defensive guard: every code6111 value actually in use must resolve to
  // EXACTLY ONE CSV entry. Check this BEFORE opening a transaction — no
  // point starting a write we already know must abort.
  const ambiguous = [];
  const missing = [];
  for (const code6111 of distinctCode6111Values) {
    const matches = csvByCode6111.get(code6111) ?? [];
    if (matches.length === 0) missing.push(code6111);
    else if (matches.length > 1) ambiguous.push({ code6111, matches });
  }
  if (missing.length > 0 || ambiguous.length > 0) {
    console.error('\n[operational-category6111-backfill] ❌ Refusing to proceed — data problem found, not applying anything:');
    if (missing.length) console.error('  code6111 values with NO CSV match:', missing.join(', '));
    if (ambiguous.length) {
      console.error('  code6111 values with MULTIPLE CSV matches:');
      for (const a of ambiguous) console.error(`    ${a.code6111}:`, a.matches);
    }
    await conn.end();
    process.exit(1);
  }
  console.log('[operational-category6111-backfill] All distinct code6111 values resolve to exactly one CSV entry.');

  await conn.beginTransaction();
  try {
    let total = 0;
    const applied = [];
    for (const code6111 of distinctCode6111Values) {
      const { category, subcategory } = csvByCode6111.get(code6111)[0];
      const [result] = await conn.query(
        `UPDATE booking_account SET category6111 = ?, subCategory6111 = ?
         WHERE code6111 = ? AND chartOwnerKey = 'SYSTEM' AND code NOT LIKE '6111-%' AND category6111 IS NULL`,
        [category, subcategory, code6111],
      );
      total += result.affectedRows;
      applied.push({ code6111, category, subcategory, rowsUpdated: result.affectedRows });
    }
    console.log(`\n[operational-category6111-backfill] Rows updated: ${total} (expect ${EXPECTED_COUNT})`);
    console.table(applied);

    if (MODE === 'review') {
      await conn.rollback();
      console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
      await conn.end();
      return;
    }

    if (total !== EXPECTED_COUNT) {
      await conn.rollback();
      console.error(
        `\n[operational-category6111-backfill] ❌ Refusing to commit: expected exactly ${EXPECTED_COUNT} rows updated, got ${total}. ` +
          `Rolled back — review manually.`,
      );
      await conn.end();
      process.exit(1);
    }

    await conn.commit();
    console.log('[operational-category6111-backfill] Committed.');
  } catch (err) {
    await conn.rollback();
    console.error('[operational-category6111-backfill] Error — transaction rolled back.');
    await conn.end();
    throw err;
  }

  const [verify] = await conn.query(
    `SELECT COUNT(*) n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND category6111 IS NOT NULL`,
  );
  console.log(`\n[operational-category6111-backfill] Verification — operational rows with non-null category6111 (expect ${EXPECTED_COUNT}):`, verify[0].n);

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
