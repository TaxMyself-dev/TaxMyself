// Form 6111 reference-card project, Step 3 (2026-08-11) — imports the 321
// official Tax Authority uniform-classification lines
// (tax_authority_6111_full.csv, repo root) into booking_account as INACTIVE
// reference cards. Independent of the categories-redesign master plan
// (docs/redesign/) — not one of its D1-D15 decisions.
//
// Raw mysql2, bypasses NestJS/TypeORM entirely (same pattern as every DDL/
// bulk-write script in this folder) so this can never race with
// `synchronize`.
//
// Prerequisite DDL (run automatically if needed, same idempotent-check
// pattern as the formPart script): widens booking_account.type to nullable
// — see 2026-08-11_widen-booking-account-type.sql for why (Elazar decision,
// 2026-08-11: NULL rather than a guessed type, consistent with the
// code6111/vatPercent "never invent" convention).
//
// Per row: code=internalCode (e.g. "6111-3566" — NEVER the raw 4-digit
// code6111, to avoid any collision with the 5-digit operational chart or
// the legacy 4-digit balance codes), name="category – subcategory" (or just
// category if subcategory is blank), code6111=the clean official code,
// formPart from the CSV, reportScope derived (A->pnl, B->annual,
// C->technical), isActive=false, type/vatPercent/taxPercent/
// reductionPercent/isEquipment/recognitionType all NULL, ownerType/
// chartOwnerKey='SYSTEM'.
//
// MODE=review (default): parses the CSV, runs the collision check, prints a
//   sample + per-formPart counts, writes NOTHING.
// MODE=apply CONFIRM=yes: re-runs the collision check, widens `type` if
//   needed, batch-inserts all 321 rows in one transaction, prints the
//   per-formPart verification count (expect A=141, B=40, C=140).
// Idempotent: if all 321 codes already exist, reports done and exits
//   cleanly rather than re-inserting or dumping a 321-row collision list.
//
// Target: keepintax-dev ONLY. Refuses to run against anything else.
//
//   node scripts/migrations/2026-08-11_import-6111-reference-cards.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-11_import-6111-reference-cards.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const CSV_PATH = path.resolve(__dirname, '..', '..', '..', 'tax_authority_6111_full.csv');
const TYPE_DDL_PATH = path.resolve(__dirname, '2026-08-11_widen-booking-account-type.sql');

const REPORT_SCOPE_BY_FORM_PART = { A: 'pnl', B: 'annual', C: 'technical' };

/** Minimal RFC4180 line parser (quoted fields, embedded commas, doubled
 *  "" for a literal quote). Fine here because the file has no embedded
 *  newlines inside fields (verified: line count === header + 321). */
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
    code6111: header.indexOf('code6111'),
    category: header.indexOf('category'),
    subcategory: header.indexOf('subcategory'),
    internalCode: header.indexOf('internalCode'),
  };
  for (const [key, i] of Object.entries(idx)) {
    if (i === -1) throw new Error(`CSV missing expected column: ${key}`);
  }
  return lines.slice(1).map((line, n) => {
    const f = parseCsvLine(line);
    const formPart = f[idx.formPart].trim();
    const category = f[idx.category].trim();
    const subcategory = f[idx.subcategory].trim();
    const internalCode = f[idx.internalCode].trim();
    const code6111 = f[idx.code6111].trim();
    if (!['A', 'B', 'C'].includes(formPart)) {
      throw new Error(`Row ${n + 2}: invalid formPart "${formPart}"`);
    }
    if (!internalCode || !category) {
      throw new Error(`Row ${n + 2}: missing internalCode/category`);
    }
    return {
      formPart,
      code6111,
      category,
      subcategory,
      internalCode,
      name: subcategory ? `${category} – ${subcategory}` : category,
      reportScope: REPORT_SCOPE_BY_FORM_PART[formPart],
    };
  });
}

async function typeColumnNullable(conn) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM booking_account LIKE 'type'`);
  return rows[0]?.Null === 'YES';
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
  console.log(`[6111-import] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const rows = loadCsvRows();
  console.log(`[6111-import] Parsed ${rows.length} rows from ${CSV_PATH}`);
  const byFormPart = rows.reduce((acc, r) => ((acc[r.formPart] = (acc[r.formPart] || 0) + 1), acc), {});
  console.log('[6111-import] Rows by formPart:', byFormPart);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    multipleStatements: true,
  });

  // Idempotency short-circuit: already fully imported?
  const [[{ n: existingRefCount }]] = await conn.query(
    `SELECT COUNT(*) n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code LIKE '6111-%'`,
  );
  if (existingRefCount === rows.length) {
    console.log(`[6111-import] ${existingRefCount} '6111-%' rows already present, matching CSV row count — already imported, nothing to do.`);
    const [counts] = await conn.query(
      `SELECT formPart, COUNT(*) as n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code LIKE '6111-%' GROUP BY formPart`,
    );
    console.table(counts);
    await conn.end();
    return;
  }
  if (existingRefCount > 0) {
    console.error(
      `\n[6111-import] ❌ Found ${existingRefCount} existing '6111-%' rows, which does NOT match the CSV's ${rows.length} — ` +
        `partial/anomalous state, refusing to proceed automatically. Review manually.`,
    );
    await conn.end();
    process.exit(1);
  }

  // Collision check — the internalCode values must not collide with any
  // existing operational code (5-digit chart, 4-digit balance codes, etc.).
  const codes = rows.map((r) => r.internalCode);
  const [collisions] = await conn.query(`SELECT code, chartOwnerKey FROM booking_account WHERE code IN (?)`, [codes]);
  if (collisions.length > 0) {
    console.error(`\n[6111-import] ❌ ${collisions.length} internalCode collision(s) found — refusing to insert:`);
    console.table(collisions);
    await conn.end();
    process.exit(1);
  }
  console.log('[6111-import] Collision check: 0 existing rows match any of the 321 internalCodes.');

  console.log('\n[6111-import] Sample rows (first 5):');
  console.table(rows.slice(0, 5).map((r) => ({ code: r.internalCode, name: r.name, code6111: r.code6111, formPart: r.formPart, reportScope: r.reportScope })));

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
    await conn.end();
    return;
  }

  const typeNullable = await typeColumnNullable(conn);
  if (!typeNullable) {
    console.log('[6111-import] Widening booking_account.type to nullable:', TYPE_DDL_PATH);
    await conn.query(fs.readFileSync(TYPE_DDL_PATH, 'utf8'));
    console.log('[6111-import] type column widened.');
  } else {
    console.log('[6111-import] type column already nullable — skipping DDL.');
  }

  await conn.beginTransaction();
  try {
    for (const r of rows) {
      await conn.query(
        `INSERT INTO booking_account
           (code, name, type, code6111, formPart, reportScope, isActive,
            vatPercent, taxPercent, reductionPercent, isEquipment, recognitionType,
            ownerType, chartOwnerKey, accountantId, userId, businessNumber, visibilityScope,
            sectionId, pnlCategory, displayOrder)
         VALUES (?, ?, NULL, ?, ?, ?, 0,
                 NULL, NULL, NULL, NULL, NULL,
                 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL,
                 NULL, NULL, NULL)`,
        [r.internalCode, r.name, r.code6111, r.formPart, r.reportScope],
      );
    }
    await conn.commit();
    console.log(`[6111-import] Inserted ${rows.length} rows, transaction committed.`);
  } catch (err) {
    await conn.rollback();
    console.error('[6111-import] Insert failed, transaction rolled back.');
    throw err;
  }

  const [counts] = await conn.query(
    `SELECT formPart, COUNT(*) as n FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code LIKE '6111-%' GROUP BY formPart`,
  );
  console.log('\n[6111-import] Verification — counts by formPart (expect A=141, B=40, C=140):');
  console.table(counts);

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
