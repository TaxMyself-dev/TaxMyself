// Form 6111 category/sub-category project, Step 2 (2026-08-14) — backfills
// booking_account.category6111/subCategory6111 on the 321 '6111-%'
// reference rows, sourced from tax_authority_6111_full.csv, matched by
// `code` = the CSV's `internalCode` (the exact same matching key
// 2026-08-11_import-6111-reference-cards.js used to create these rows in
// the first place). Independent of the categories-redesign master plan
// (docs/redesign/) — not one of its D1-D15 decisions.
//
// Deliberately re-reads the CSV's category/subcategory columns directly
// rather than re-splitting the reference row's own `name` field (built as
// "category – subcategory" at import time) — some subcategory values
// themselves contain " – ", which would make a string-split ambiguous.
// This is exact.
//
// Raw mysql2, bypasses NestJS/TypeORM entirely so this can never race with
// `synchronize`.
//
// Safety: every UPDATE carries `AND category6111 IS NULL`, so this is safe
// to re-run. Runs inside one transaction; refuses (rolls back) unless the
// total is exactly 321.
//
// MODE=review (default): runs the UPDATE inside a transaction for an exact
//   preview, then ALWAYS rolls back.
// MODE=apply CONFIRM=yes: runs the UPDATE, checks the total is exactly 321,
//   commits if so, otherwise rolls back and exits non-zero.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-14_backfill-category6111-on-reference-rows.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-14_backfill-category6111-on-reference-rows.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const CSV_PATH = path.resolve(__dirname, '..', '..', '..', 'tax_authority_6111_full.csv');
const EXPECTED_COUNT = 321;

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

function loadCsvRows() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const idx = {
    category: header.indexOf('category'),
    subcategory: header.indexOf('subcategory'),
    internalCode: header.indexOf('internalCode'),
  };
  for (const [key, i] of Object.entries(idx)) {
    if (i === -1) throw new Error(`CSV missing expected column: ${key}`);
  }
  return lines.slice(1).map((line, n) => {
    const f = parseCsvLine(line);
    const internalCode = f[idx.internalCode].trim();
    const category = f[idx.category].trim();
    const subcategory = f[idx.subcategory].trim();
    if (!internalCode || !category) throw new Error(`Row ${n + 2}: missing internalCode/category`);
    return { internalCode, category, subcategory: subcategory || null };
  });
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
  console.log(`[reference-category6111-backfill] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const rows = loadCsvRows();
  console.log(`[reference-category6111-backfill] Parsed ${rows.length} rows from ${CSV_PATH} (expect ${EXPECTED_COUNT})`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  await conn.beginTransaction();
  try {
    let total = 0;
    for (const r of rows) {
      const [result] = await conn.query(
        `UPDATE booking_account SET category6111 = ?, subCategory6111 = ?
         WHERE code = ? AND chartOwnerKey = 'SYSTEM' AND category6111 IS NULL`,
        [r.category, r.subcategory, r.internalCode],
      );
      total += result.affectedRows;
    }
    console.log(`\n[reference-category6111-backfill] Rows updated: ${total} (expect ${EXPECTED_COUNT})`);

    if (MODE === 'review') {
      await conn.rollback();
      console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
      await conn.end();
      return;
    }

    if (total !== EXPECTED_COUNT) {
      await conn.rollback();
      console.error(
        `\n[reference-category6111-backfill] ❌ Refusing to commit: expected exactly ${EXPECTED_COUNT} rows updated, got ${total}. ` +
          `Rolled back — review manually.`,
      );
      await conn.end();
      process.exit(1);
    }

    await conn.commit();
    console.log('[reference-category6111-backfill] Committed.');
  } catch (err) {
    await conn.rollback();
    console.error('[reference-category6111-backfill] Error — transaction rolled back.');
    await conn.end();
    throw err;
  }

  const [verify] = await conn.query(
    `SELECT COUNT(*) n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code LIKE '6111-%' AND category6111 IS NOT NULL`,
  );
  console.log(`\n[reference-category6111-backfill] Verification — reference rows with non-null category6111 (expect ${EXPECTED_COUNT}):`, verify[0].n);

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
