/**
 * Dev-only comparison script — runs legacy vs journal-based VAT + P&L reports
 * for both ledger-test businesses and prints a side-by-side diff.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/compare-reports.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { SharedService } from '../src/shared/shared.service';

const FIREBASE_ID  = 'qEw5g3YQchWfEDJdfQTdAvBFxJn1'; // demo+ledger@keepintax.local
const EXEMPT_BN    = '111111118';
const LICENSED_BN  = '222222224';
const START        = '2026-01-01';
const END          = '2026-03-31';

function n(v: number | undefined | null): string {
  return (v ?? 0).toFixed(2);
}

function diffLine(label: string, leg: number, jnl: number): string {
  const delta = jnl - leg;
  const flag  = Math.abs(delta) > 0.01 ? ' ← DIFF' : '';
  return `  ${label.padEnd(28)} ${n(leg).padStart(10)}    ${n(jnl).padStart(10)}    ${n(delta).padStart(8)}${flag}`;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const svc    = app.get(ReportsService);
  const shared = app.get(SharedService);

  const start = shared.convertStringToDateObject(START)!;
  const end   = shared.convertStringToDateObject(END)!;

  for (const bn of [EXEMPT_BN, LICENSED_BN]) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`Business: ${bn} (${bn === EXEMPT_BN ? 'עוסק פטור' : 'עוסק מורשה'})`);
    console.log('='.repeat(72));

    // ── VAT ──────────────────────────────────────────────────────────────
    const legacyVat  = await svc.createVatReport(FIREBASE_ID, bn, start, end);
    const journalVat = await svc.createVatReportFromJournal(FIREBASE_ID, bn, start, end);

    console.log('\n── VAT report ──────────────────────────────────────────────────────────');
    console.log(`  ${'field'.padEnd(28)} ${'Legacy'.padStart(10)}    ${'Journal'.padStart(10)}    ${'Delta'.padStart(8)}`);
    let vatMatch = true;
    const vatRows = [
      ['vatableTurnover',      legacyVat.vatableTurnover,      journalVat.vatableTurnover],
      ['nonVatableTurnover',   legacyVat.nonVatableTurnover,   journalVat.nonVatableTurnover],
      ['vatRefundOnAssets',    legacyVat.vatRefundOnAssets,    journalVat.vatRefundOnAssets],
      ['vatRefundOnExpenses',  legacyVat.vatRefundOnExpenses,  journalVat.vatRefundOnExpenses],
      ['vatPayment',           legacyVat.vatPayment,           journalVat.vatPayment],
    ] as [string, number, number][];
    for (const [label, leg, jnl] of vatRows) {
      const line = diffLine(label, leg, jnl);
      if (line.includes('← DIFF')) vatMatch = false;
      console.log(line);
    }
    console.log(vatMatch ? '  ✅ VAT matches' : '  ❌ VAT has differences');

    // ── P&L ──────────────────────────────────────────────────────────────
    const legacyPnl  = await svc.createPnLReport(FIREBASE_ID, bn, start, end);
    const journalPnl = await svc.createPnLReportFromJournal(FIREBASE_ID, bn, start, end);

    console.log('\n── P&L report ──────────────────────────────────────────────────────────');
    console.log(`  ${'field'.padEnd(28)} ${'Legacy'.padStart(10)}    ${'Journal'.padStart(10)}    ${'Delta'.padStart(8)}`);
    let pnlMatch = true;
    const pnlSummaryRows = [
      ['income',             legacyPnl.income,             journalPnl.income],
      ['netProfitBeforeTax', legacyPnl.netProfitBeforeTax, journalPnl.netProfitBeforeTax],
    ] as [string, number, number][];
    for (const [label, leg, jnl] of pnlSummaryRows) {
      const line = diffLine(label, leg, jnl);
      if (line.includes('← DIFF')) pnlMatch = false;
      console.log(line);
    }

    // P&L expense lines per category
    const legacyMap  = new Map<string, number>();
    const journalMap = new Map<string, number>();
    for (const row of legacyPnl.expenses)  legacyMap.set(row.category,  Number(row.total));
    for (const row of journalPnl.expenses) journalMap.set(row.category, Number(row.total));
    const allCats = new Set([...legacyMap.keys(), ...journalMap.keys()]);
    if (allCats.size > 0) {
      console.log('\n  Expense breakdown per P&L category:');
      for (const cat of [...allCats].sort()) {
        const leg = legacyMap.get(cat)  ?? 0;
        const jnl = journalMap.get(cat) ?? 0;
        const line = diffLine(cat, leg, jnl);
        if (line.includes('← DIFF')) pnlMatch = false;
        console.log(line);
      }
    }
    console.log(pnlMatch ? '  ✅ P&L matches' : '  ❌ P&L has differences');
  }

  console.log('\n' + '='.repeat(72));
  await app.close();
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
