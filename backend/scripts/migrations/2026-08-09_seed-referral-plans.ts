/**
 * Referral-signup subscription plans seed (2026-08-09) — data-only, dedicated
 * to the accountant-referral-signup feature. NOT part of the categories/
 * accounting redesign; independent of docs/redesign/categories-redesign-master-plan.md.
 *
 * Seeds two NEW SubscriptionPlan rows used exclusively by the referral-signup
 * flow (UsersService.signup + POST /billing/upgrade-to-open-banking) — never
 * reuses or modifies any existing general consumer plan:
 *   - referral-basic         — ₪29.00/mo incl. VAT, all modules except OPEN_BANKING
 *   - referral-open-banking  — ₪59.00/mo incl. VAT, all modules including OPEN_BANKING
 *
 * IMPORTANT — subscription_plan.price_monthly_agorot is stored BEFORE VAT
 * (PricingService adds VAT at checkout time: see calculateBillingAmounts).
 * To land on an exact ₪29.00 / ₪59.00 VAT-INCLUSIVE retail price at the
 * current 18% VAT rate (VAT_RATES[2026], src/enum.ts — same source
 * SharedService.getVatRateByYear() reads):
 *   referral-basic:        2458 agorot pre-VAT -> 2900 (₪29.00) exactly
 *   referral-open-banking: 5000 agorot pre-VAT -> 5900 (₪59.00) exactly
 * Verified 2026-08-09 by actually running the real
 * PricingService.calculateBillingAmounts() against both inputs (not just the
 * arithmetic below) — confirmed vatAmountAgorot=442/900 and
 * amountIncludingVatAgorot=2900/5900 exactly, no rounding drift:
 *   SharedService.getVatRateByYear(2026-08-09)   = 0.18
 *   calculateBillingAmounts(2458) = { amountBeforeVatAgorot: 2458, vatRate: 18, vatAmountAgorot: 442, amountIncludingVatAgorot: 2900 }
 *   calculateBillingAmounts(5000) = { amountBeforeVatAgorot: 5000, vatRate: 18, vatAmountAgorot: 900, amountIncludingVatAgorot: 5900 }
 * If VAT_RATES ever changes for a later year, these two rows need re-deriving
 * the same way (re-run the calc, don't just redo the arithmetic by hand) —
 * they do NOT auto-adjust to a rate change.
 *
 * isPublic=false on both — referral-only plans, deliberately hidden from the
 * general GET /billing/plans listing so they never appear as an option to a
 * normal (non-referred) signup. isActive=true so they remain valid targets
 * for planId assignment (referral signup, the open-banking upgrade endpoint).
 *
 * MODE=review (default): read-only, prints what would be inserted, writes NOTHING.
 * MODE=apply CONFIRM=yes: inserts any plan(s) not already present (by slug).
 * Idempotent — running twice never creates duplicates.
 *
 * Target: keepintax-dev ONLY (tsandbox). Refuses to run against anything
 * else — this seeds sandbox data, not a production change.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/migrations/2026-08-09_seed-referral-plans.ts
 *   (add MODE=apply CONFIRM=yes to actually write)
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ModuleName } from '../../src/enum';

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';

interface ReferralPlanSeed {
  slug: string;
  name: string;
  description: string;
  priceMonthlyAgorot: number;
  modules: ModuleName[];
  trialDays: number;
  displayOrder: number;
}

const REFERRAL_PLANS: ReferralPlanSeed[] = [
  {
    slug: 'referral-basic',
    name: 'הפניית רואה חשבון — בסיסי',
    description: 'תוכנית ייעודית להרשמה דרך קישור הפניה של רואה חשבון — ₪29 לחודש כולל מע"מ.',
    priceMonthlyAgorot: 2458,
    modules: [ModuleName.INVOICES, ModuleName.EXPENSES, ModuleName.ACCOUNTANT],
    trialDays: 30,
    displayOrder: 100,
  },
  {
    slug: 'referral-open-banking',
    name: 'הפניית רואה חשבון — כולל חיבור בנקאי פתוח',
    description:
      'תוכנית ייעודית להרשמה דרך קישור הפניה של רואה חשבון — ₪59 לחודש כולל מע"מ, כולל חיבור בנקאי פתוח (Open Banking).',
    priceMonthlyAgorot: 5000,
    modules: [ModuleName.INVOICES, ModuleName.EXPENSES, ModuleName.ACCOUNTANT, ModuleName.OPEN_BANKING],
    trialDays: 30,
    displayOrder: 101,
  },
];

async function main() {
  if (process.env.DB_DATABASE !== 'keepintax-dev') {
    throw new Error(
      `Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}. ` +
        `This seeds sandbox-only referral plans — set DB_DATABASE=keepintax-dev explicitly before running.`,
    );
  }
  if (MODE === 'apply' && process.env.CONFIRM !== 'yes') {
    throw new Error('MODE=apply requires CONFIRM=yes — refusing to write without explicit confirmation.');
  }
  console.log(`[seed-referral-plans] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dataSource = app.get(DataSource);

  const existing: { slug: string }[] = await dataSource.query(
    `SELECT slug FROM subscription_plan WHERE slug IN (?, ?)`,
    REFERRAL_PLANS.map((p) => p.slug),
  );
  const existingSlugs = new Set(existing.map((r) => r.slug));
  const toInsert = REFERRAL_PLANS.filter((p) => !existingSlugs.has(p.slug));

  console.log(`\n[seed-referral-plans] ${REFERRAL_PLANS.length} referral plan(s) defined.`);
  if (existingSlugs.size > 0) {
    console.log(`[seed-referral-plans] already present (no-op): ${[...existingSlugs].join(', ')}`);
  }
  if (toInsert.length === 0) {
    console.log('[seed-referral-plans] nothing to insert.');
    await app.close();
    return;
  }

  console.log(`\n[seed-referral-plans] ${toInsert.length} plan(s) TO INSERT:`);
  console.table(
    toInsert.map((p) => ({
      slug: p.slug,
      name: p.name,
      priceMonthlyAgorot: p.priceMonthlyAgorot,
      modules: p.modules.join(', '),
      trialDays: p.trialDays,
    })),
  );

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
    await app.close();
    return;
  }

  await dataSource.transaction(async (manager) => {
    for (const p of toInsert) {
      await manager.query(
        `INSERT INTO subscription_plan
           (slug, name, description, price_monthly_agorot, currency, modules, trial_days, is_active, is_public, display_order)
         VALUES (?, ?, ?, ?, 'ILS', ?, ?, 1, 0, ?)`,
        [p.slug, p.name, p.description, p.priceMonthlyAgorot, JSON.stringify(p.modules), p.trialDays, p.displayOrder],
      );
    }
  });

  console.log(`\n[seed-referral-plans] MODE=apply complete: inserted ${toInsert.length} plan(s).`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
