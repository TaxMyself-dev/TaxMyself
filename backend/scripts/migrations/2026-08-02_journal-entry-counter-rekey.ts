/**
 * JOURNAL_ENTRY setting_documents counter rekey (2026-08-02) — data-only
 * migration, independent of the categories/accounting redesign (confirmed:
 * not mentioned anywhere in docs/redesign/categories-redesign-master-plan.md
 * D1-D15). No schema change — same columns, just re-keyed.
 *
 * Background: every other docType in setting_documents is keyed on
 * (userId=firebaseId, issuerBusinessNumber=businessNumber, docType). The
 * JOURNAL_ENTRY counter has always been keyed with userId=businessNumber
 * instead (a day-one design artifact — see SharedService.getJournalEntryCurrentIndex,
 * already fixed in code as of commit 982adc9a to accept both firebaseId and
 * issuerBusinessNumber). This script rekeys the EXISTING rows to match.
 *
 * For every setting_documents row with docType='JOURNAL_ENTRY':
 *   1. businessNumber := COALESCE(issuerBusinessNumber, userId) — the real
 *      business number, wherever it currently lives.
 *   2. Look up business.firebaseId for that businessNumber.
 *   3a. Not found -> ORPHAN. Row is left untouched, listed in the summary
 *       for manual handling. Never guessed.
 *   3b. Found, and userId is ALREADY that firebaseId (and issuerBusinessNumber
 *       already equals businessNumber) -> ALREADY CORRECT, no-op. This is
 *       what makes a second run of MODE=apply idempotent.
 *   3c. Found, and not already correct -> UPDATE userId=firebaseId,
 *       issuerBusinessNumber=businessNumber.
 *   Before writing anything, all planned (3c) updates are checked against
 *   each other for a duplicate target key (same firebaseId+businessNumber
 *   from two different source rows) — MODE=apply refuses if any collision
 *   is found, since the unique index would reject it anyway and a silent
 *   partial write is worse than an explicit stop.
 *
 * MODE=review (default): read-only, prints every row's classification and
 *   planned before/after values, writes NOTHING.
 * MODE=apply CONFIRM=yes: re-runs the identical classification, then writes
 *   the (3c) updates inside a single transaction (rolls back on any error).
 *
 * This script only ever targets keepintax_prodcopy directly. Production
 * itself is NOT touched by running this script — per the agreed process,
 * the reviewed SQL is applied to production manually via phpMyAdmin, only
 * after MODE=apply has been reviewed and approved against keepintax_prodcopy.
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/migrations/2026-08-02_journal-entry-counter-rekey.ts
 *
 *   (add MODE=apply CONFIRM=yes to actually write)
 */
import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { AppModule } from '../../src/app.module';

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';

interface JournalCounterRow {
  id: number;
  userId: string;
  issuerBusinessNumber: string | null;
  currentIndex: number;
  initialIndex: number | null;
}

interface BusinessRow {
  firebaseId: string;
  businessNumber: string;
}

type Classification =
  | { kind: 'ALREADY_CORRECT'; row: JournalCounterRow; businessNumber: string; firebaseId: string }
  | { kind: 'UPDATE'; row: JournalCounterRow; businessNumber: string; firebaseId: string }
  | { kind: 'ORPHAN'; row: JournalCounterRow; businessNumber: string };

async function classifyRows(dataSource: DataSource): Promise<Classification[]> {
  const rows: JournalCounterRow[] = await dataSource.query(
    `SELECT id, userId, issuerBusinessNumber, currentIndex, initialIndex
     FROM setting_documents
     WHERE docType = 'JOURNAL_ENTRY'
     ORDER BY id`,
  );

  const classifications: Classification[] = [];
  for (const row of rows) {
    const businessNumber = row.issuerBusinessNumber ?? row.userId;
    const [business]: BusinessRow[] = await dataSource.query(
      `SELECT firebaseId, businessNumber FROM business WHERE businessNumber = ? LIMIT 1`,
      [businessNumber],
    );

    if (!business) {
      classifications.push({ kind: 'ORPHAN', row, businessNumber });
      continue;
    }

    const alreadyCorrect = row.userId === business.firebaseId && row.issuerBusinessNumber === businessNumber;
    if (alreadyCorrect) {
      classifications.push({ kind: 'ALREADY_CORRECT', row, businessNumber, firebaseId: business.firebaseId });
    } else {
      classifications.push({ kind: 'UPDATE', row, businessNumber, firebaseId: business.firebaseId });
    }
  }
  return classifications;
}

function findCollisions(updates: Extract<Classification, { kind: 'UPDATE' }>[]): string[] {
  const seen = new Map<string, number[]>();
  for (const u of updates) {
    const key = `${u.firebaseId}::${u.businessNumber}`;
    const ids = seen.get(key) ?? [];
    ids.push(u.row.id);
    seen.set(key, ids);
  }
  const collisions: string[] = [];
  for (const [key, ids] of seen) {
    if (ids.length > 1) {
      collisions.push(`target (firebaseId, businessNumber)=${key} claimed by setting_documents.id IN (${ids.join(', ')})`);
    }
  }
  return collisions;
}

function printReview(classifications: Classification[]) {
  const already = classifications.filter((c): c is Extract<Classification, { kind: 'ALREADY_CORRECT' }> => c.kind === 'ALREADY_CORRECT');
  const updates = classifications.filter((c): c is Extract<Classification, { kind: 'UPDATE' }> => c.kind === 'UPDATE');
  const orphans = classifications.filter((c): c is Extract<Classification, { kind: 'ORPHAN' }> => c.kind === 'ORPHAN');

  console.log(`\n[journal-entry-counter-rekey] ${classifications.length} JOURNAL_ENTRY row(s) found in setting_documents.`);

  if (updates.length > 0) {
    console.log(`\n[journal-entry-counter-rekey] ${updates.length} row(s) TO UPDATE:`);
    console.table(
      updates.map((u) => ({
        id: u.row.id,
        currentIndex: u.row.currentIndex,
        'userId (before)': u.row.userId,
        'issuerBusinessNumber (before)': u.row.issuerBusinessNumber,
        'userId (after)': u.firebaseId,
        'issuerBusinessNumber (after)': u.businessNumber,
      })),
    );
  }

  if (already.length > 0) {
    console.log(`\n[journal-entry-counter-rekey] ${already.length} row(s) ALREADY CORRECT (no-op):`);
    console.table(already.map((a) => ({ id: a.row.id, userId: a.row.userId, issuerBusinessNumber: a.row.issuerBusinessNumber })));
  }

  if (orphans.length > 0) {
    console.log(`\n[journal-entry-counter-rekey] ${orphans.length} row(s) ORPHANED — no matching business.businessNumber, left UNTOUCHED, needs manual review:`);
    console.table(orphans.map((o) => ({ id: o.row.id, userId: o.row.userId, issuerBusinessNumber: o.row.issuerBusinessNumber, resolvedBusinessNumber: o.businessNumber, currentIndex: o.row.currentIndex })));
  } else {
    console.log(`\n[journal-entry-counter-rekey] 0 orphaned rows.`);
  }
}

async function main() {
  if (process.env.DB_DATABASE !== 'keepintax_prodcopy') {
    throw new Error(
      `Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}. ` +
      `Set DB_DATABASE=keepintax_prodcopy explicitly before running this script.`,
    );
  }
  if (MODE === 'apply' && process.env.CONFIRM !== 'yes') {
    throw new Error('MODE=apply requires CONFIRM=yes — refusing to write without explicit confirmation.');
  }
  console.log(`[journal-entry-counter-rekey] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dataSource = app.get(DataSource);

  const classifications = await classifyRows(dataSource);
  printReview(classifications);

  const updates = classifications.filter((c): c is Extract<Classification, { kind: 'UPDATE' }> => c.kind === 'UPDATE');
  const alreadyCorrect = classifications.filter((c) => c.kind === 'ALREADY_CORRECT');
  const orphans = classifications.filter((c) => c.kind === 'ORPHAN');

  const collisions = findCollisions(updates);
  if (collisions.length > 0) {
    console.error(`\n[journal-entry-counter-rekey] ❌ ${collisions.length} collision(s) found among planned updates — refusing to proceed:`);
    collisions.forEach((c) => console.error(`  - ${c}`));
    await app.close();
    process.exit(1);
  }

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
    await app.close();
    return;
  }

  // ── MODE=apply: write all (3c) updates in one transaction ──
  await dataSource.transaction(async (manager: EntityManager) => {
    for (const u of updates) {
      await manager.query(
        `UPDATE setting_documents SET userId = ?, issuerBusinessNumber = ? WHERE id = ?`,
        [u.firebaseId, u.businessNumber, u.row.id],
      );
    }
  });

  console.log(
    `\n[journal-entry-counter-rekey] MODE=apply complete: ${updates.length} row(s) updated, ` +
    `${alreadyCorrect.length} row(s) already correct, ${orphans.length} orphan(s) left untouched.`,
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
