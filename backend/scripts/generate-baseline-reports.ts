/**
 * Phase 0.5 — generates the golden baseline report fixtures that Phases 1–4
 * of the categories/accounting redesign must reproduce exactly (modulo
 * docs/redesign/intentional-diffs.md).
 *
 * For every business with at least one journal entry, runs
 * createVatReportFromJournal / createPnLReportFromJournal for every
 * reporting period that has journal data, plus one aggregate VAT/P&L over
 * the business's full date range and one full-range createLedgerReport
 * (all accounts). Output: one JSON file per business in
 * docs/redesign/baseline-reports/, plus an index.json summary.
 *
 * Must run against keepintax_prodcopy, not the configured dev DB. Override
 * the database via env var (dotenv does not clobber an already-set var).
 * NODE_ENV=production disables TypeORM's `synchronize` (never let it touch
 * this DB's schema). SKIP_BOOT_SEED=true no-ops AccountSeedService.onModuleInit
 * (it otherwise writes to default_category/default_sub_category on every
 * boot, unconditionally — harmless to these reports, which never read those
 * tables, but pollutes the DB for later inspection):
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/generate-baseline-reports.ts
 *
 * Fallback if SKIP_BOOT_SEED ever stops covering every write path: re-import
 * the pristine dump before/after running (see docs/redesign/production-baseline.md).
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { SharedService } from '../src/shared/shared.service';
import { Business } from '../src/business/business.entity';

const OUT_DIR = path.resolve(__dirname, '../../docs/redesign/baseline-reports');

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE === 'keepintax-dev') {
    throw new Error(
      `Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}. ` +
      `Set DB_DATABASE=keepintax_prodcopy explicitly before running this script.`,
    );
  }
  console.log(`[generate-baseline-reports] target database: ${process.env.DB_DATABASE}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const reportsService = app.get(ReportsService);
  const sharedService = app.get(SharedService);
  const dataSource = app.get(DataSource);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Businesses with at least one journal entry = the universe of "active
  // businesses" for baseline-report purposes (a business with zero journal
  // data has nothing for these reports to reproduce).
  const businessRows: { firebaseId: string; issuerBusinessNumber: string; minDate: string; maxDate: string }[] =
    await dataSource.query(
      `SELECT firebaseId, issuerBusinessNumber, MIN(date) as minDate, MAX(date) as maxDate
       FROM journal_entry
       GROUP BY firebaseId, issuerBusinessNumber
       ORDER BY issuerBusinessNumber`,
    );

  console.log(`[generate-baseline-reports] ${businessRows.length} business(es) with journal data`);

  const index: any[] = [];

  for (const row of businessRows) {
    const { firebaseId, issuerBusinessNumber: businessNumber } = row;
    const business = await dataSource.getRepository(Business).findOne({ where: { businessNumber, firebaseId } });
    if (!business) {
      console.warn(`[generate-baseline-reports] SKIP ${businessNumber}/${firebaseId}: no business row found`);
      index.push({ businessNumber, firebaseId, skipped: true, reason: 'no business row' });
      continue;
    }

    const minDate = new Date(row.minDate);
    const maxDate = new Date(row.maxDate);

    // Walk month by month, grouping consecutive months that share the same
    // period label (handles both monthly and bimonthly VAT cadences) into
    // discrete [periodStart, periodEnd] ranges covering the full data span.
    type Period = { label: string; start: Date; end: Date };
    const periods: Period[] = [];
    let cursor = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
    const limit = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1));
    while (cursor.getTime() <= limit.getTime()) {
      const label = sharedService.buildReportPeriodLabel(business.businessType, business.vatReportingType, cursor);
      const monthStart = new Date(cursor);
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      const last = periods[periods.length - 1];
      if (last && last.label === label) {
        last.end = monthEnd;
      } else {
        periods.push({ label, start: monthStart, end: monthEnd });
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }

    console.log(`[generate-baseline-reports] ${businessNumber} (${business.businessName}): ` +
      `${toDateOnly(minDate)}..${toDateOnly(maxDate)}, ${periods.length} period(s)`);

    const periodResults = [];
    for (const p of periods) {
      const vat = await reportsService.createVatReportFromJournal(firebaseId, businessNumber, p.start, p.end);
      const pnl = await reportsService.createPnLReportFromJournal(firebaseId, businessNumber, p.start, p.end);
      periodResults.push({
        label: p.label,
        startDate: toDateOnly(p.start),
        endDate: toDateOnly(p.end),
        vat,
        pnl,
      });
    }

    const aggregateVat = await reportsService.createVatReportFromJournal(firebaseId, businessNumber, minDate, maxDate);
    const aggregatePnl = await reportsService.createPnLReportFromJournal(firebaseId, businessNumber, minDate, maxDate);
    const ledger = await reportsService.createLedgerReport(firebaseId, businessNumber, minDate, maxDate, null);

    const fixture = {
      businessNumber,
      firebaseId,
      businessName: business.businessName,
      businessType: business.businessType,
      vatReportingType: business.vatReportingType,
      taxReportingType: business.taxReportingType,
      dateRange: { start: toDateOnly(minDate), end: toDateOnly(maxDate) },
      periods: periodResults,
      aggregate: { vat: aggregateVat, pnl: aggregatePnl },
      ledger,
      generatedAt: new Date().toISOString(),
      sourceDb: process.env.DB_DATABASE,
    };

    const fileName = `${businessNumber}.json`;
    fs.writeFileSync(path.join(OUT_DIR, fileName), JSON.stringify(fixture, null, 2), 'utf8');
    console.log(`[generate-baseline-reports]   -> ${fileName}`);

    index.push({
      businessNumber,
      firebaseId,
      businessName: business.businessName,
      dateRange: fixture.dateRange,
      periodCount: periods.length,
      periodLabels: periods.map((p) => p.label),
      file: fileName,
    });
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), sourceDb: process.env.DB_DATABASE, businesses: index }, null, 2),
    'utf8',
  );
  console.log(`[generate-baseline-reports] wrote index.json (${index.length} businesses) to ${OUT_DIR}`);

  await app.close();
}

main().catch((err) => {
  console.error('[generate-baseline-reports] FAILED:', err?.message ?? err);
  console.error(err);
  process.exit(1);
});
