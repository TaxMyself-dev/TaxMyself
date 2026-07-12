/**
 * Phase 1.7 — compares the Phase 0.5 golden baseline fixtures
 * (docs/redesign/baseline-reports/*.json, generated BEFORE the Phase 1.4
 * chart renumbering) against a fresh run of the same
 * generate-baseline-reports.ts script AFTER the renumbering
 * (docs/redesign/baseline-reports-post-migration/*.json, generated with
 * OUT_DIR_NAME=baseline-reports-post-migration against the migrated
 * keepintax_prodcopy).
 *
 * Per D15 (docs/redesign/intentional-diffs.md), every VAT/P&L/ledger number
 * must match exactly EXCEPT the two registered corrections:
 *   - Correction #1: business 204245724's six Bituach Leumi journal lines
 *     (ids below) move from old account 5000 to new technical account
 *     90300, so "הוצאות בלתי מזוהות" vanishes from that business's P&L
 *     (whole periods + aggregate) and netProfitBeforeTax rises by exactly
 *     the removed category total. VAT is unaffected (none of these lines
 *     touch 2410).
 *   - Correction #2: two duplicate categories merge with zero production
 *     usage — expected delta is ₪0.00 everywhere, i.e. no special-casing
 *     needed, just documented so a future re-run isn't treated as
 *     suspicious if it ever shows up.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/compare-baseline-reports.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { ACCOUNT_CODE_MIGRATION } from '../src/bookkeeping/chart.seed';

const OLD_DIR = path.resolve(__dirname, '../../docs/redesign/baseline-reports');
const NEW_DIR = path.resolve(__dirname, '../../docs/redesign/baseline-reports-post-migration');
const EPS = 0.01;

// ─── D15 registry (docs/redesign/intentional-diffs.md) ─────────────────────

const CORRECTION_1_BUSINESS = '204245724';
const CORRECTION_1_CATEGORY = 'הוצאות בלתי מזוהות';
const CORRECTION_1_JOURNAL_ENTRY_IDS = new Set([
  10000145, 10000158, 10000167, 10000173, 10000186, 10000203,
]);
const CORRECTION_1_OLD_ACCOUNT = '5000';
const CORRECTION_1_NEW_ACCOUNT = '90300';
const CORRECTION_1_EXPECTED_AGGREGATE_AMOUNT_FOR_TAX = 11775.40;

// old accountCode -> new accountCode, accountCode-sourced rows only (ledger
// reports carry parent-level codes; subAccountCode-sourced rows never
// appear as a bare journal_line.accountCode).
const CODE_MAP = new Map<string, string>();
for (const m of ACCOUNT_CODE_MIGRATION) {
  if (m.source === 'accountCode') CODE_MAP.set(m.oldCode, m.newCode);
}

/** Maps one OLD ledger account code to its expected NEW code, honoring the
 *  Correction #1 special case (journalEntryId-specific, not code-generic). */
function mapOldLedgerCode(oldCode: string, journalEntryId: number): string {
  if (oldCode === CORRECTION_1_OLD_ACCOUNT && CORRECTION_1_JOURNAL_ENTRY_IDS.has(journalEntryId)) {
    return CORRECTION_1_NEW_ACCOUNT;
  }
  return CODE_MAP.get(oldCode) ?? oldCode; // balance-sheet/VAT codes are unchanged
}

let failureCount = 0;
const failures: string[] = [];

function almostEqual(a: number, b: number): boolean {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= EPS;
}

function reportDiff(label: string, oldV: number, newV: number): void {
  if (!almostEqual(oldV, newV)) {
    failureCount++;
    failures.push(`  ❌ ${label}: old=${(oldV ?? 0).toFixed(2)} new=${(newV ?? 0).toFixed(2)} delta=${((newV ?? 0) - (oldV ?? 0)).toFixed(2)}`);
  }
}

function compareVat(label: string, oldVat: any, newVat: any): void {
  for (const field of ['vatableTurnover', 'nonVatableTurnover', 'vatRefundOnAssets', 'vatRefundOnExpenses', 'vatPayment', 'vatRate']) {
    reportDiff(`${label} VAT.${field}`, oldVat[field], newVat[field]);
  }
}

function comparePnl(label: string, oldPnl: any, newPnl: any, businessNumber: string): void {
  reportDiff(`${label} PNL.income`, oldPnl.income, newPnl.income);

  // Phase 4.4 renamed ExpensePnlDto.category → sectionName (D3 section
  // grouping); the golden fixtures predate the rename. Section names are
  // string-identical to the old pnlCategory labels (verified against
  // keepintax_prodcopy), so keying on either field compares like-for-like.
  const pnlKey = (e: any) => e.sectionName ?? e.category;
  const oldCats = new Map<string, number>(oldPnl.expenses.map((e: any) => [pnlKey(e), e.total]));
  const newCats = new Map<string, number>(newPnl.expenses.map((e: any) => [pnlKey(e), e.total]));
  const allCats = new Set([...oldCats.keys(), ...newCats.keys()]);

  let correction1Removed = 0;
  for (const cat of allCats) {
    const oldTotal = oldCats.get(cat) ?? 0;
    const newTotal = newCats.get(cat) ?? 0;

    if (businessNumber === CORRECTION_1_BUSINESS && cat === CORRECTION_1_CATEGORY && oldTotal > 0 && newTotal === 0) {
      // Correction #1: category vanished entirely — expected, not a failure.
      correction1Removed = oldTotal;
      continue;
    }
    reportDiff(`${label} PNL.expenses[${cat}]`, oldTotal, newTotal);
  }

  // netProfitBeforeTax must rise by exactly the removed category's total
  // (income and every other expense category are otherwise untouched).
  const expectedNewNet = oldPnl.netProfitBeforeTax + correction1Removed;
  reportDiff(`${label} PNL.netProfitBeforeTax${correction1Removed ? ' (Correction #1 adjusted)' : ''}`, expectedNewNet, newPnl.netProfitBeforeTax);
}

/** Regroups the OLD ledger's lines by their EXPECTED new account code
 *  (via mapOldLedgerCode) and returns per-new-code debit/credit totals,
 *  so it can be diffed directly against the NEW ledger's real accounts. */
function regroupOldLedgerByNewCode(oldLedger: any): Map<string, { debit: number; credit: number; count: number }> {
  const buckets = new Map<string, { debit: number; credit: number; count: number }>();
  for (const account of oldLedger.accounts) {
    for (const line of account.lines) {
      const newCode = mapOldLedgerCode(account.accountCode, line.journalEntryId);
      const bucket = buckets.get(newCode) ?? { debit: 0, credit: 0, count: 0 };
      bucket.debit += Number(line.debit) || 0;
      bucket.credit += Number(line.credit) || 0;
      bucket.count += 1;
      buckets.set(newCode, bucket);
    }
  }
  return buckets;
}

function compareLedger(oldLedger: any, newLedger: any): void {
  const expected = regroupOldLedgerByNewCode(oldLedger);
  const actual = new Map<string, { debit: number; credit: number; count: number }>(
    newLedger.accounts.map((a: any) => [a.accountCode, { debit: a.totalDebit, credit: a.totalCredit, count: a.lineCount }]),
  );

  const allCodes = new Set([...expected.keys(), ...actual.keys()]);
  for (const code of allCodes) {
    const exp = expected.get(code) ?? { debit: 0, credit: 0, count: 0 };
    const act = actual.get(code) ?? { debit: 0, credit: 0, count: 0 };
    reportDiff(`Ledger[${code}].debit`, exp.debit, act.debit);
    reportDiff(`Ledger[${code}].credit`, exp.credit, act.credit);
    if (exp.count !== act.count) {
      failureCount++;
      failures.push(`  ❌ Ledger[${code}].lineCount: old=${exp.count} new=${act.count}`);
    }
  }

  // Old code ranges must be fully absent from the new ledger (Phase 1's
  // "Definition of done": old code ranges absent from journal_line).
  const oldOnlyCodes = ['5000', '5100', '5200', '5300', '5400', '5500', '5600', '5700', '5800', '5900', '6000', '6100', '6200', '6300', '4000', '4010'];
  for (const code of oldOnlyCodes) {
    if (newLedger.accounts.some((a: any) => a.accountCode === code)) {
      failureCount++;
      failures.push(`  ❌ Ledger: old code ${code} still present in the post-migration ledger`);
    }
  }
}

function main(): void {
  const index = JSON.parse(fs.readFileSync(path.join(OLD_DIR, 'index.json'), 'utf8'));
  console.log(`[compare-baseline-reports] comparing ${index.businesses.length} business(es)\n`);

  for (const { businessNumber, file } of index.businesses) {
    const oldPath = path.join(OLD_DIR, file);
    const newPath = path.join(NEW_DIR, file);
    if (!fs.existsSync(newPath)) {
      failureCount++;
      failures.push(`  ❌ [${businessNumber}] missing post-migration fixture: ${newPath}`);
      continue;
    }

    const oldFixture = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
    const newFixture = JSON.parse(fs.readFileSync(newPath, 'utf8'));
    const before = failureCount;

    if (oldFixture.periods.length !== newFixture.periods.length) {
      failureCount++;
      failures.push(`  ❌ [${businessNumber}] period count changed: old=${oldFixture.periods.length} new=${newFixture.periods.length}`);
    } else {
      for (let i = 0; i < oldFixture.periods.length; i++) {
        const oldP = oldFixture.periods[i];
        const newP = newFixture.periods[i];
        const label = `[${businessNumber}] ${oldP.label}`;
        compareVat(label, oldP.vat, newP.vat);
        comparePnl(label, oldP.pnl, newP.pnl, businessNumber);
      }
    }

    compareVat(`[${businessNumber}] aggregate`, oldFixture.aggregate.vat, newFixture.aggregate.vat);
    comparePnl(`[${businessNumber}] aggregate`, oldFixture.aggregate.pnl, newFixture.aggregate.pnl, businessNumber);
    compareLedger(oldFixture.ledger, newFixture.ledger);

    // Correction #1's precise registered number, checked once per business.
    if (businessNumber === CORRECTION_1_BUSINESS) {
      const oldAgg = new Map<string, number>(oldFixture.aggregate.pnl.expenses.map((e: any) => [e.category, e.total]));
      const removed = oldAgg.get(CORRECTION_1_CATEGORY) ?? 0;
      if (!almostEqual(removed, CORRECTION_1_EXPECTED_AGGREGATE_AMOUNT_FOR_TAX)) {
        failureCount++;
        failures.push(
          `  ❌ [${businessNumber}] Correction #1 aggregate amount mismatch: ` +
          `registered=${CORRECTION_1_EXPECTED_AGGREGATE_AMOUNT_FOR_TAX} actual-old=${removed.toFixed(2)}`,
        );
      }
    }

    console.log(`  ${failureCount === before ? '✅' : '❌'} [${businessNumber}] ${oldFixture.businessName}`);
  }

  console.log('\n' + '='.repeat(72));
  if (failureCount === 0) {
    console.log('✅ ALL CLEAR — zero un-registered diffs.');
  } else {
    console.log(`❌ ${failureCount} un-registered diff(s):\n`);
    console.log(failures.join('\n'));
  }
  console.log('='.repeat(72));

  process.exit(failureCount === 0 ? 0 : 1);
}

main();
