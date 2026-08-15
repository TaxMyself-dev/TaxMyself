// Form 6111 reference-card project, data-repair (2026-08-13) — corrects
// booking_account.formPart on the 321 '6111-%' reference rows imported by
// 2026-08-11_import-6111-reference-cards.js. Independent of the
// categories-redesign master plan (docs/redesign/) — not one of its D1-D15
// decisions.
//
// Root cause: an early, pre-fix draft of the import script (uncommitted,
// never landed in git) was the one actually run with MODE=apply against
// keepintax-dev, inserting all 321 rows with formPart=NULL. The corrected,
// committed version of that script was written afterward but never re-run,
// because its idempotency guard only compared row COUNT against the CSV
// (321 present == 321 expected), not content — so it silently reported
// "already imported" every time since. Confirmed via direct query: DB has
// exactly 321 '6111-%' rows, all isActive=0 (row-level import genuinely
// succeeded), but formPart is NULL on 100% of them, while the source CSV's
// own formPart column sums to the expected 141 A / 40 B / 140 C.
//
// UPDATE, not delete-and-reimport: re-running the import would churn all
// 321 rows' auto-increment ids for no reason, and put any future
// sub_category/reference that points at one of these ids by id at risk.
// This only ever SETs formPart, on existing rows, matched by `code` (the
// `6111-XXXX` internalCode, the table's actual unique code — never the raw
// 4-digit code6111).
//
// Raw mysql2, bypasses NestJS/TypeORM entirely (same pattern as every
// DDL/bulk-write script in this folder) so this can never race with
// `synchronize`.
//
// Safety: every UPDATE carries `AND formPart IS NULL`, so this is safe to
// re-run — it can never clobber a row that already has a formPart set,
// including the 68 operational SYSTEM rows backfilled by
// 2026-08-11_add-form-part-to-booking-account.js (different codes entirely,
// but belt-and-suspenders since the WHERE clause alone already protects
// them). The whole pass runs inside one transaction; before committing it
// prints the per-formPart breakdown of rows about to be updated and
// refuses (rolls back) unless the total is exactly 321 — a mismatch means
// the CSV and DB have drifted since this script was written and it needs a
// human look, not a blind write.
//
// MODE=review (default): runs the same UPDATEs inside a transaction to get
//   an exact preview, then ALWAYS rolls back — writes NOTHING regardless of
//   what the counts look like.
// MODE=apply CONFIRM=yes: runs the UPDATEs, checks the total is exactly
//   321, commits if so, otherwise rolls back and exits non-zero.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-13_backfill-formpart-on-reference-rows.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-13_backfill-formpart-on-reference-rows.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const CSV_PATH = path.resolve(__dirname, '..', '..', '..', 'tax_authority_6111_full.csv');

/** Minimal RFC4180 line parser (quoted fields, embedded commas, doubled ""
 *  for a literal quote) — same as 2026-08-11_import-6111-reference-cards.js,
 *  duplicated rather than shared since every script in this folder is
 *  self-contained. */
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
    formPart: header.indexOf('formPart'),
    internalCode: header.indexOf('internalCode'),
  };
  for (const [key, i] of Object.entries(idx)) {
    if (i === -1) throw new Error(`CSV missing expected column: ${key}`);
  }
  return lines.slice(1).map((line, n) => {
    const f = parseCsvLine(line);
    const formPart = f[idx.formPart].trim();
    const internalCode = f[idx.internalCode].trim();
    if (!['A', 'B', 'C'].includes(formPart)) {
      throw new Error(`Row ${n + 2}: invalid formPart "${formPart}"`);
    }
    if (!internalCode) {
      throw new Error(`Row ${n + 2}: missing internalCode`);
    }
    return { formPart, internalCode };
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
  console.log(`[formpart-backfill-repair] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const rows = loadCsvRows();
  console.log(`[formpart-backfill-repair] Parsed ${rows.length} rows from ${CSV_PATH}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  await conn.beginTransaction();
  const perFormPart = { A: 0, B: 0, C: 0 };
  try {
    for (const r of rows) {
      const [result] = await conn.query(
        `UPDATE booking_account SET formPart = ? WHERE code = ? AND chartOwnerKey = 'SYSTEM' AND formPart IS NULL`,
        [r.formPart, r.internalCode],
      );
      perFormPart[r.formPart] += result.affectedRows;
    }
    const total = perFormPart.A + perFormPart.B + perFormPart.C;
    console.log(`\n[formpart-backfill-repair] Rows that would be updated, by target formPart:`, perFormPart, `total: ${total} (expect 321)`);

    if (MODE === 'review') {
      await conn.rollback();
      console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
      await conn.end();
      return;
    }

    if (total !== 321) {
      await conn.rollback();
      console.error(
        `\n[formpart-backfill-repair] ❌ Refusing to commit: expected exactly 321 rows updated, got ${total}. ` +
          `The CSV and DB have drifted since this script was written — rolled back, review manually.`,
      );
      await conn.end();
      process.exit(1);
    }

    await conn.commit();
    console.log('[formpart-backfill-repair] Committed.');
  } catch (err) {
    await conn.rollback();
    console.error('[formpart-backfill-repair] Error — transaction rolled back.');
    await conn.end();
    throw err;
  }

  const [verify] = await conn.query(
    `SELECT formPart, COUNT(*) as n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code LIKE '6111-%' GROUP BY formPart`,
  );
  console.log('\n[formpart-backfill-repair] Verification — counts by formPart (expect A=141, B=40, C=140, zero NULL):');
  console.table(verify);

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
