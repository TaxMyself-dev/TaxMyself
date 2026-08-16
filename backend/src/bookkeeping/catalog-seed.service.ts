import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingSection } from './accounting-section.entity';
import { BookingAccount } from './account.entity';
import { ACCOUNTING_SECTIONS, CHART_ACCOUNTS } from './chart.seed';
import { SYSTEM_CATEGORIES, SYSTEM_SUB_CATEGORIES } from './catalog.seed';
import { CatalogService } from './catalog.service';
import { OwnerType, SYSTEM_CHART_OWNER_KEY } from 'src/enum';

/**
 * Phase 2.6 (D13) — flat idempotent seeder replacing AccountSeedService's
 * 640-line keyword-matching cascade. Four steps, each create-if-missing
 * from literal data reviewed with Elazar (chart.seed.ts for sections/
 * accounts — Phase 1.3; catalog.seed.ts for the SYSTEM category/sub_category
 * catalog — Phase 2.2's reviewed migration output, restated portably).
 *
 * GUARD INVARIANT throughout, all four steps (create-only, 2026-08-14 —
 * see docs/redesign/booking-account-write-paths-audit.md): every row is
 * matched by its natural key (chartOwnerKey+code for sections/accounts,
 * chartOwnerKey+name(+categoryId) for category/sub_category) and, if a
 * match already exists, is left COMPLETELY untouched — not even a partial
 * field refresh. This seeder owns creation of the base chart on an empty
 * DB only; every update (law fields, isActive, code6111/category6111/
 * subCategory6111, name/code corrections, ...) belongs exclusively to the
 * admin screen or a one-off script — one writer per operation, never both.
 * Previously (pre-2026-08-14) seedSections/seedAccounts force-wrote every
 * tracked field on every boot via Object.assign, which silently reverted
 * any admin edit to an existing row's law fields/isActive on the next
 * restart — a live production risk the moment this ever ran against a DB
 * with 6111 data, since production boots this seeder on every deploy
 * without SKIP_BOOT_SEED (see cutover-day-checklist.md Step 5).
 */
@Injectable()
export class CatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSeedService.name);

  constructor(
    @InjectRepository(AccountingSection) private readonly sectionRepo: Repository<AccountingSection>,
    @InjectRepository(BookingAccount) private readonly accountRepo: Repository<BookingAccount>,
    private readonly catalogService: CatalogService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Escape hatch for one-off scripts/reports run against a database that
    // must stay byte-for-byte identical to its source (e.g. keepintax_prodcopy,
    // the categories-redesign baseline-report fixtures) — see
    // docs/redesign/production-baseline.md "Open items". Standalone
    // migration/verification scripts that WANT the seed to run against such a
    // database call `runSeed()` directly instead of relying on this hook.
    if (process.env.SKIP_BOOT_SEED === 'true') {
      this.logger.log('SKIP_BOOT_SEED=true — CatalogSeedService.onModuleInit is a no-op.');
      return;
    }
    await this.runSeed();
  }

  async runSeed(): Promise<void> {
    try {
      await this.seedSections();
    } catch (err: any) {
      this.logger.error(`Accounting-section seed failed: ${err?.message ?? err}`);
    }

    try {
      await this.seedAccounts();
    } catch (err: any) {
      this.logger.error(`Chart-of-accounts seed failed: ${err?.message ?? err}`);
    }

    try {
      await this.seedSystemCatalog();
    } catch (err: any) {
      this.logger.error(`SYSTEM catalog seed failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Create-if-missing only (2026-08-14) — an existing row (matched by
   * chartOwnerKey+code) is left untouched, full stop. No partial refresh of
   * name/displayOrder either; an admin correction to a section's name is
   * exactly as permanent as an admin correction to an account's vatPercent
   * now, for the same reason (see class doc comment).
   */
  private async seedSections(): Promise<void> {
    let created = 0, skipped = 0;
    for (const s of ACCOUNTING_SECTIONS) {
      const existing = await this.sectionRepo.findOne({ where: { chartOwnerKey: s.chartOwnerKey, code: s.code } });
      if (existing) {
        skipped++;
        continue;
      }
      await this.sectionRepo.save(this.sectionRepo.create(s));
      created++;
    }
    this.logger.log(`Accounting sections ensured (${created} created, ${skipped} already existed and were left untouched, ${ACCOUNTING_SECTIONS.length} total).`);
  }

  /**
   * Create-if-missing only (2026-08-14) — an existing row (matched by
   * chartOwnerKey+code) is left completely untouched: not code6111, not
   * vatPercent/taxPercent/reductionPercent/isEquipment/recognitionType, not
   * isActive, nothing. `chart.seed.ts` is the source of truth for what a
   * NEW row looks like on an empty DB only; every field on an existing row
   * belongs exclusively to the admin screen / a one-off script from here on
   * (see class doc comment for why this changed).
   */
  private async seedAccounts(): Promise<void> {
    const sections = await this.sectionRepo.find({ where: { chartOwnerKey: SYSTEM_CHART_OWNER_KEY } });
    const sectionIdByCode = new Map(sections.map((s) => [s.code, s.id]));

    let created = 0, skipped = 0;
    for (const { sectionCode, legacyCode, legacySource, ...rest } of CHART_ACCOUNTS) {
      const existing = await this.accountRepo.findOne({ where: { chartOwnerKey: rest.chartOwnerKey, code: rest.code } });
      if (existing) {
        skipped++;
        continue;
      }
      const sectionId = sectionCode ? (sectionIdByCode.get(sectionCode) ?? null) : null;
      await this.accountRepo.save(this.accountRepo.create({ ...rest, sectionId }));
      created++;
    }
    this.logger.log(`Chart of accounts ensured (${created} created, ${skipped} already existed and were left untouched, ${CHART_ACCOUNTS.length} total).`);
  }

  private async seedSystemCatalog(): Promise<void> {
    const scope = this.catalogService.buildScope(OwnerType.SYSTEM, {});

    const categoryIdByName = new Map<string, number>();
    for (const cat of SYSTEM_CATEGORIES) {
      const row = await this.catalogService.findOrCreateCategory(scope, cat.name, cat.type);
      categoryIdByName.set(cat.name, row.id);
    }
    this.logger.log(`SYSTEM categories ensured (${SYSTEM_CATEGORIES.length} checked).`);

    let created = 0;
    let skipped = 0;
    for (const sub of SYSTEM_SUB_CATEGORIES) {
      const categoryId = categoryIdByName.get(sub.category);
      if (!categoryId) {
        this.logger.error(`Catalog seed: SYSTEM category "${sub.category}" not found for sub-category "${sub.name}" — skipped.`);
        skipped++;
        continue;
      }

      // GUARD INVARIANT: create-if-missing only — an existing row (from a
      // prior boot, or an admin edit via the default-sub-category endpoints)
      // is never touched again.
      const existing = await this.catalogService.findSubCategoryInSingleScope(SYSTEM_CHART_OWNER_KEY, categoryId, sub.name);
      if (existing) continue;

      let accountId: number | null = null;
      if (sub.accountCode) {
        const account = await this.catalogService.findAccountByCode(SYSTEM_CHART_OWNER_KEY, sub.accountCode);
        if (!account) {
          this.logger.error(
            `Catalog seed: account code "${sub.accountCode}" not found for "${sub.category} / ${sub.name}" — skipped (check seedAccounts ran first).`,
          );
          skipped++;
          continue;
        }
        accountId = account.id;
      }

      const category = await this.catalogService.findCategoryById(categoryId);
      await this.catalogService.createSubCategory(scope, category!, sub.name, {
        isPrivate: sub.isPrivate ?? false,
        accountId,
      });
      created++;
    }

    this.logger.log(
      `SYSTEM sub-categories ensured (${created} newly created, ${skipped} skipped, out of ${SYSTEM_SUB_CATEGORIES.length} seed rows; existing rows left untouched).`,
    );
  }
}
