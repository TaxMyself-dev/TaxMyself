// Form 6111 category/sub-category project, Step A (2026-08-14) — backfills
// booking_account.code6111 on the 59 operational (non-'6111-%') SYSTEM rows
// the accountant has an authoritative mapping for. Independent of the
// categories-redesign master plan (docs/redesign/) — not one of its D1-D15
// decisions.
//
// Source: operational_code6111_map.csv (repo root) — columns code,name,
// code6111. Deliberately accountant-assigned (not derived by fuzzy-matching
// account names against the Tax Authority CSV) — see
// docs/redesign/form-6111-category-backfill-findings.md for why that
// distinction matters here. `name` is a human sanity aid only; matching is
// by `code`, never by name.
//
// The 9 operational codes NOT in the map (60000, 1000, 90200/90300/90500,
// 61350-61380) intentionally keep code6111=NULL — untouched by this script
// (their code is simply absent from the CSV, so no UPDATE targets them).
//
// Raw mysql2, bypasses NestJS/TypeORM entirely (same pattern as every
// DDL/bulk-write script in this folder) so this can never race with
// `synchronize` — but NOT with CatalogSeedService.seedAccounts(), which is
// a real, confirmed hazard specifically for `code6111`: it runs on every
// app boot (unless SKIP_BOOT_SEED=true) and does an unconditional
// `Object.assign(existing, rest, ...)` per operational row, where `rest`
// includes `code6111: null` straight from chart.seed.ts's hardcoded seed
// data. If a `nest start --watch` process is alive against keepintax-dev
// (no SKIP_BOOT_SEED) and restarts — e.g. because a backend file was saved
// — anytime after this script runs, it will silently re-null every
// operational row's code6111 again. category6111/subCategory6111 are safe
// (not part of CHART_ACCOUNTS' tracked fields), only code6111 is at risk.
// Confirmed happening live during this script's own development (2026-08-14)
// — see docs/redesign/form-6111-category-backfill-findings.md. Run this
// script LAST, after all other backend edits for the session are done and
// the watcher has fully settled (verify no new `dist/main` child process
// before/after, don't just wait a fixed delay), or with the watcher paused.
//
// Safety: every UPDATE carries `AND code6111 IS NULL`, so this is safe to
// re-run — it can never clobber a row that already has a code6111 (e.g. if
// this script runs again after a partial prior run, or after a future
// manual edit). Runs inside one transaction; before committing it prints
// the count of rows about to be updated and refuses (rolls back) unless the
// total is exactly 59 — a mismatch means the CSV and DB have drifted since
// this script was written and it needs a human look, not a blind write.
//
// MODE=review (default): runs the UPDATE inside a transaction to get an
//   exact preview, then ALWAYS rolls back — writes NOTHING regardless of
//   what the count looks like.
// MODE=apply CONFIRM=yes: runs the UPDATE, checks the total is exactly 59,
//   commits if so, otherwise rolls back and exits non-zero.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-14_backfill-operational-code6111.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-14_backfill-operational-code6111.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const CSV_PATH = path.resolve(__dirname, '..', '..', '..', 'operational_code6111_map.csv');
const EXPECTED_COUNT = 59;

/** Minimal RFC4180 line parser (quoted fields, embedded commas, doubled ""
 *  for a literal quote) — same as every other CSV-driven script in this
 *  folder, duplicated rather than shared since each script is self-contained. */
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
  const idx = { code: header.indexOf('code'), name: header.indexOf('name'), code6111: header.indexOf('code6111') };
  for (const [key, i] of Object.entries(idx)) {
    if (i === -1) throw new Error(`CSV missing expected column: ${key}`);
  }
  return lines.slice(1).map((line, n) => {
    const f = parseCsvLine(line);
    const code = f[idx.code].trim();
    const name = f[idx.name].trim();
    const code6111 = f[idx.code6111].trim();
    if (!code || !code6111) throw new Error(`Row ${n + 2}: missing code/code6111`);
    return { code, name, code6111 };
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
  console.log(`[operational-code6111-backfill] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const rows = loadCsvRows();
  console.log(`[operational-code6111-backfill] Parsed ${rows.length} rows from ${CSV_PATH} (expect ${EXPECTED_COUNT})`);

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
    const applied = [];
    for (const r of rows) {
      const [result] = await conn.query(
        `UPDATE booking_account SET code6111 = ? WHERE code = ? AND chartOwnerKey = 'SYSTEM' AND code6111 IS NULL`,
        [r.code6111, r.code],
      );
      total += result.affectedRows;
      if (result.affectedRows > 0) applied.push(r);
    }
    console.log(`\n[operational-code6111-backfill] Rows updated: ${total} (expect ${EXPECTED_COUNT})`);

    if (MODE === 'review') {
      await conn.rollback();
      console.table(applied.map((r) => ({ code: r.code, name: r.name, code6111: r.code6111 })));
      console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
      await conn.end();
      return;
    }

    // Guard on the FINAL state, not the delta — this script is also safe to
    // re-run as a partial repair (e.g. some rows already correct, only a
    // subset actually needs the UPDATE), in which case `total` (rows
    // touched by THIS run) is legitimately less than 59. What must always
    // be true is that all 59 end up correct, whether via this run alone or
    // a mix of this run and an earlier one.
    const [[{ n: finalCount }]] = await conn.query(
      `SELECT COUNT(*) n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND code6111 IS NOT NULL`,
    );
    if (Number(finalCount) !== EXPECTED_COUNT) {
      await conn.rollback();
      console.error(
        `\n[operational-code6111-backfill] ❌ Refusing to commit: after applying, ${finalCount} operational rows have a ` +
          `non-null code6111, expected exactly ${EXPECTED_COUNT}. The CSV and DB have drifted since this script was ` +
          `written — rolled back, review manually.`,
      );
      await conn.end();
      process.exit(1);
    }

    console.log(`[operational-code6111-backfill] This run updated ${total} row(s); final state has all ${EXPECTED_COUNT} correct — committing.`);
    await conn.commit();
    console.log('[operational-code6111-backfill] Committed.');
  } catch (err) {
    await conn.rollback();
    console.error('[operational-code6111-backfill] Error — transaction rolled back.');
    await conn.end();
    throw err;
  }

  const [verify] = await conn.query(
    `SELECT COUNT(*) n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND code6111 IS NOT NULL`,
  );
  console.log(`\n[operational-code6111-backfill] Verification — operational rows with non-null code6111 (expect ${EXPECTED_COUNT}):`, verify[0].n);

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
