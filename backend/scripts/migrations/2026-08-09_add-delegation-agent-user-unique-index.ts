/**
 * Delegation (agentId, userId) unique index (2026-08-09) — schema-only
 * migration, referral-signup feature Phase 3 (delegation data-integrity
 * hardening). Adds a real DB-level uniqueness guarantee that the existing
 * ux_delegation_agent_external index does NOT provide — it's keyed on
 * (agentId, externalCustomerId), and externalCustomerId is always NULL in
 * every current write path (see docs/accountant-referral-signup-investigation.md
 * §1.1), so it never actually stops a duplicate (agentId, userId) pair today.
 * NOT part of the categories/accounting redesign; independent of
 * docs/redesign/categories-redesign-master-plan.md.
 *
 * Confirmed by Elazar 2026-08-09: skipping the keepintax_prodcopy duplicate
 * audit — real production delegation volume is negligible, no meaningful
 * duplicate-cleanup risk. The keepintax-dev audit (this feature's Phase 0)
 * already found ZERO duplicate (agentId, userId) pairs.
 *
 * This script re-checks for duplicates immediately before applying (in case
 * data changed since that audit) and refuses to add the index if any exist —
 * a duplicate pair would make the ALTER TABLE fail anyway; this fails loudly
 * with the offending rows instead of a raw SQL error.
 *
 * MODE=review (default): read-only, prints the duplicate check + planned DDL, writes NOTHING.
 * MODE=apply CONFIRM=yes: re-runs the duplicate check, then adds the unique index.
 * Idempotent — checks INFORMATION_SCHEMA first, so a second run is a no-op.
 *
 * Target: keepintax-dev ONLY (tsandbox). Refuses to run against anything else.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/migrations/2026-08-09_add-delegation-agent-user-unique-index.ts
 *   (add MODE=apply CONFIRM=yes to actually write)
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const INDEX_NAME = 'ux_delegation_agent_user';

interface DuplicatePairRow {
  agentId: string;
  userId: string;
  row_count: number;
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
  console.log(`[delegation-agent-user-unique-index] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dataSource = app.get(DataSource);

  // Idempotency: does the index already exist?
  const existingIndex: { count: number }[] = await dataSource.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delegation' AND INDEX_NAME = ?`,
    [INDEX_NAME],
  );
  if (Number(existingIndex[0]?.count) > 0) {
    console.log(`[delegation-agent-user-unique-index] Index ${INDEX_NAME} already exists — nothing to do.`);
    await app.close();
    return;
  }

  // Duplicate check — re-verified now, not just trusted from the earlier Phase 0 audit.
  const duplicates: DuplicatePairRow[] = await dataSource.query(
    `SELECT agentId, userId, COUNT(*) as row_count
     FROM delegation
     GROUP BY agentId, userId
     HAVING COUNT(*) > 1`,
  );

  console.log(`\n[delegation-agent-user-unique-index] Duplicate (agentId, userId) pairs found: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.table(duplicates);
    console.error(
      `\n[delegation-agent-user-unique-index] Refusing to add the unique index — ${duplicates.length} ` +
        `duplicate pair(s) exist and would make the ALTER TABLE fail. Resolve them first.`,
    );
    await app.close();
    process.exit(1);
  }
  console.log(`[delegation-agent-user-unique-index] No duplicates — safe to add ${INDEX_NAME}.`);

  if (MODE === 'review') {
    console.log(
      `\n(dry run — pass MODE=apply CONFIRM=yes to run: ` +
        `ALTER TABLE delegation ADD UNIQUE INDEX ${INDEX_NAME} (agentId, userId))`,
    );
    await app.close();
    return;
  }

  await dataSource.query(`ALTER TABLE delegation ADD UNIQUE INDEX ${INDEX_NAME} (agentId, userId)`);
  console.log(`\n[delegation-agent-user-unique-index] MODE=apply complete: ${INDEX_NAME} added.`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
