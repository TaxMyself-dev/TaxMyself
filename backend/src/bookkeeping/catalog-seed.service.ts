import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingSection } from './accounting-section.entity';
import { BookingAccount } from './account.entity';
import { ACCOUNTING_SECTIONS, CHART_ACCOUNTS } from './chart.seed';
import { SYSTEM_CATEGORIES, SYSTEM_SUB_CATEGORIES } from './catalog.seed';
import { CatalogService } from './catalog.service';
import { ExpenseReportScope, OwnerType, SYSTEM_CHART_OWNER_KEY } from 'src/enum';

/**
 * Phase 2.6 (D13) — flat idempotent seeder replacing AccountSeedService's
 * 640-line keyword-matching cascade. Four steps, each upserting/inserting
 * from literal data reviewed with Elazar (chart.seed.ts for sections/
 * accounts — Phase 1.3; catalog.seed.ts for the SYSTEM category/sub_category
 * catalog — Phase 2.2's reviewed migration output, restated portably).
 *
 * GUARD INVARIANT throughout: sections/accounts are upserted by
 * (chartOwnerKey, code) so an admin edit to name/percents survives a reboot
 * only if this seed's own values already match — same as the old seeder's
 * "never touch a row that already has a value" contract, expressed instead
 * as "the seed IS the value" since these are curated, reviewed constants,
 * not keyword guesses. category/sub_category rows are create-if-missing
 * only (never upserted) — an admin who edits a SYSTEM sub-category's mapping
 * via the admin panel owns that row from then on.
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
   * Explicit find-then-create/update loop rather than `.upsert()` — TypeORM's
   * upsert() throws ("Cannot update entity because entity id is not set in
   * the entity") when the conflict target is a non-PK composite unique index
   * and the driver needs to re-fetch "returning" columns (e.g. `updatedAt`)
   * after an UPDATE branch; confirmed against `keepintax_prodcopy` during
   * Phase 2.6 rehearsal — no data was corrupted (row counts held steady) but
   * every row threw. This pattern sidesteps that TypeORM code path entirely.
   */
  private async seedSections(): Promise<void> {
    let created = 0, refreshed = 0;
    for (const s of ACCOUNTING_SECTIONS) {
      const existing = await this.sectionRepo.findOne({ where: { chartOwnerKey: s.chartOwnerKey, code: s.code } });
      if (existing) {
        Object.assign(existing, s);
        await this.sectionRepo.save(existing);
        refreshed++;
      } else {
        await this.sectionRepo.save(this.sectionRepo.create(s));
        created++;
      }
    }
    this.logger.log(`Accounting sections ensured (${created} created, ${refreshed} refreshed, ${ACCOUNTING_SECTIONS.length} total).`);
  }

  private async seedAccounts(): Promise<void> {
    const sections = await this.sectionRepo.find({ where: { chartOwnerKey: SYSTEM_CHART_OWNER_KEY } });
    const sectionIdByCode = new Map(sections.map((s) => [s.code, s.id]));

    let created = 0, refreshed = 0;
    for (const { sectionCode, legacyCode, legacySource, ...rest } of CHART_ACCOUNTS) {
      const sectionId = sectionCode ? (sectionIdByCode.get(sectionCode) ?? null) : null;
      const existing = await this.accountRepo.findOne({ where: { chartOwnerKey: rest.chartOwnerKey, code: rest.code } });
      if (existing) {
        Object.assign(existing, rest, { sectionId });
        await this.accountRepo.save(existing);
        refreshed++;
      } else {
        await this.accountRepo.save(this.accountRepo.create({ ...rest, sectionId }));
        created++;
      }
    }
    this.logger.log(`Chart of accounts ensured (${created} created, ${refreshed} refreshed, ${CHART_ACCOUNTS.length} total).`);
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
        reportScope: sub.reportScope ?? ExpenseReportScope.PNL,
      });
      created++;
    }

    this.logger.log(
      `SYSTEM sub-categories ensured (${created} newly created, ${skipped} skipped, out of ${SYSTEM_SUB_CATEGORIES.length} seed rows; existing rows left untouched).`,
    );
  }
}
