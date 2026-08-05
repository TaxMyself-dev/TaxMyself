import 'reflect-metadata';
import { ACCOUNTING_SECTIONS, CHART_ACCOUNTS, ACCOUNT_CODE_MIGRATION } from '../../src/bookkeeping/chart.seed';

// Phase 1.4 — one-off SQL generator (same pattern as export-chart-review.ts).
// Emits the literal INSERT statements for accounting_section / booking_account /
// account_code_migration, generated verbatim from chart.seed.ts (the
// already-reviewed-and-approved single source of truth — see
// docs/redesign/phase1-chart-review.md) so Section B of
// 2026-07-10_chart_renumber.sql carries zero hand-transcription risk.
//
// Run with: npx ts-node -r tsconfig-paths/register scripts/migrations/2026-07-10_generate-chart-seed-sql.ts
// Paste the printed output into 2026-07-10_chart_renumber.sql Section B.

function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

function sqlNum(v: number | null | undefined): string {
  return v === null || v === undefined ? 'NULL' : String(v);
}

function sqlBool(v: boolean | null | undefined): string {
  return v === null || v === undefined ? 'NULL' : (v ? '1' : '0');
}

function main() {
  console.log('-- accounting_section (16 rows) --');
  console.log('INSERT INTO `accounting_section`');
  console.log('  (`code`, `name`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `displayOrder`, `isActive`)');
  console.log('VALUES');
  console.log(
    ACCOUNTING_SECTIONS.map((s) =>
      `  (${sqlStr(s.code)}, ${sqlStr(s.name)}, ${sqlStr(s.ownerType)}, ${sqlStr(s.chartOwnerKey)}, NULL, NULL, NULL, NULL, ${sqlNum(s.displayOrder)}, 1)`,
    ).join(',\n') + ';',
  );

  console.log('\n-- booking_account (59 rows) — sectionId resolved by subquery on the just-inserted sections --');
  console.log('INSERT INTO `booking_account`');
  console.log('  (`code`, `name`, `type`, `pnlCategory`, `displayOrder`, `sectionId`, `code6111`, `vatPercent`, `taxPercent`, `reductionPercent`, `isEquipment`, `recognitionType`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `isActive`)');
  console.log('VALUES');
  console.log(
    CHART_ACCOUNTS.map((a) => {
      const sectionIdExpr = a.sectionCode
        ? `(SELECT id FROM \`accounting_section\` WHERE \`code\` = ${sqlStr(a.sectionCode)} AND \`chartOwnerKey\` = ${sqlStr(a.chartOwnerKey)})`
        : 'NULL';
      return `  (${sqlStr(a.code)}, ${sqlStr(a.name)}, ${sqlStr(a.type)}, ${sqlStr(a.pnlCategory)}, ${sqlNum(a.displayOrder)}, ${sectionIdExpr}, ${sqlStr(a.code6111)}, ${sqlNum(a.vatPercent)}, ${sqlNum(a.taxPercent)}, ${sqlNum(a.reductionPercent)}, ${sqlBool(a.isEquipment)}, ${sqlStr(a.recognitionType)}, ${sqlStr(a.ownerType)}, ${sqlStr(a.chartOwnerKey)}, NULL, NULL, NULL, NULL, ${a.isActive ? 1 : 0})`;
    }).join(',\n') + ';',
  );

  console.log('\n-- account_code_migration (50 rows) --');
  console.log('INSERT INTO `account_code_migration` (`oldCode`, `newCode`, `source`)');
  console.log('VALUES');
  console.log(
    ACCOUNT_CODE_MIGRATION.map((m) => `  (${sqlStr(m.oldCode)}, ${sqlStr(m.newCode)}, ${sqlStr(m.source)})`).join(',\n') + ';',
  );

  console.error(`\n-- generated ${ACCOUNTING_SECTIONS.length} sections, ${CHART_ACCOUNTS.length} accounts, ${ACCOUNT_CODE_MIGRATION.length} migration rows --`);
}

main();
