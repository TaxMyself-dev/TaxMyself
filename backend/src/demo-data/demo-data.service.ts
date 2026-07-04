import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import * as admin from 'firebase-admin';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  BusinessStatus,
  BusinessType,
  DocumentType,
  TaxReportingType,
  UserRole,
  VATReportingType,
} from 'src/enum';
import { DocumentsService } from 'src/documents/documents.service';
import { ExpensesService } from 'src/expenses/expenses.service';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity';
import { User } from 'src/users/user.entity';
import { UsersService } from 'src/users/users.service';
import { Business } from 'src/business/business.entity';
import { Bill } from 'src/transactions/bill.entity';
import { Source } from 'src/transactions/source.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { UserSyncState } from 'src/transactions/user-sync-state.entity';
import { ClassifiedTransactions } from 'src/transactions/classified-transactions.entity';
import { Transactions } from 'src/transactions/transactions.entity';
import { UserTransactionCacheState } from 'src/transactions/user-transaction-cache-state.entity';
import { UserSourceSyncState } from 'src/transactions/user-source-sync-state.entity';
import { UserCategory } from 'src/expenses/user-categories.entity';
import { UserSubCategory } from 'src/expenses/user-sub-categories.entity';
import { Expense } from 'src/expenses/expenses.entity';
import { Income } from 'src/expenses/incomes.entity';
import { Supplier } from 'src/expenses/suppliers.entity';
import { Documents } from 'src/documents/documents.entity';
import { DocLines } from 'src/documents/doc-lines.entity';
import { DocPayments } from 'src/documents/doc-payments.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { ExtractedDocument } from 'src/documents/extracted-document.entity';
import { Clients } from 'src/clients/clients.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { UserModuleSubscription } from 'src/users/user-module-subscription.entity';
import { Child } from 'src/users/child.entity';
import { AccountantTask } from 'src/accountant-tasks/accountant-task.entity';
import { ReportWorkflow } from 'src/report-workflow/report-workflow.entity';
import { AnnualReport } from 'src/annual-report/annual-report.entity';
import { DEMO_PROFILES, findDemoProfileByEmail } from './profiles';
import { DemoClient, DemoProfile, DemoSeedable } from './demo-profile.types';
import { GoogleDriveService, ServiceAccountQuotaError } from 'src/google-drive/google-drive.service';
import { FxRateService } from 'src/shared/fx-rate.service';

export interface DemoSubUser {
  firebaseId?: string;
  email: string;
  password: string;
  label: string;
}

export interface DemoProfileListItem {
  id: string;
  label: string;
  description: string;
  email: string;
  password: string;
  exists: boolean;
  /** firebaseId of the primary demo user (when `exists === true`). */
  firebaseId?: string;
  /** Delegated clients (email + label) when this profile has them. */
  clients?: DemoSubUser[];
}

export interface DemoSeedResult {
  firebaseId: string;
  email: string;
  password: string;
  /** firebaseId + creds for each delegated client created. */
  clients?: DemoSubUser[];
  /** Set when the profile opted into Drive sample uploads via
   *  `seedDriveFiles`. Includes the inbox folder URL so the admin can
   *  jump straight to it if manual drop is needed. */
  driveInbox?: DriveSeedInfo;
}

export interface DemoResetResult {
  existed: boolean;
  deletedRows: Record<string, number>;
}

export interface DemoTestResetResult {
  /** Files removed from inbox/processed across every business. */
  filesDeleted: number;
  /** Per-table row counts that were purged or reset. */
  dbRowsReset: Record<string, number>;
  /** Number of sample PDFs re-uploaded to the demo user's inbox/. */
  filesUploaded: number;
  /** Populated when the profile has `seedDriveFiles` — points at the
   *  inbox folder the admin/user might need to drag files into. */
  driveInbox?: DriveSeedInfo;
}

/**
 * Info about the demo user's inbox/ folder after seed/reset — surfaced
 * so the admin (or the demo user via the dashboard reset toast) knows
 * where to drop files when the service account can't upload them itself.
 */
export interface DriveSeedInfo {
  inboxFolderId: string;
  inboxFolderUrl: string;
  filesUploaded: number;
  /** True when uploads were blocked by the service-account quota wall.
   *  Caller should tell the admin to drag the PDFs in manually. */
  needsManualUpload: boolean;
}

@Injectable()
export class DemoDataService {
  private readonly logger = new Logger(DemoDataService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly driveService: GoogleDriveService,
    private readonly fxRateService: FxRateService,
    private readonly usersService: UsersService,
    private readonly documentsService: DocumentsService,
    private readonly expensesService: ExpensesService,
  ) {}

  // ---------------- Public API ----------------

  async listProfiles(): Promise<DemoProfileListItem[]> {
    const userRepo = this.dataSource.getRepository(User);
    const out: DemoProfileListItem[] = [];
    for (const p of DEMO_PROFILES) {
      const existing = await userRepo.findOne({ where: { email: p.email } });

      // Look up firebaseId for each delegated client so the frontend can use
      // view-as (clientPanelService.setSelectedClient) without re-signing-in.
      let clients: DemoSubUser[] | undefined;
      if (p.delegatedClients?.length) {
        const clientEmails = p.delegatedClients.map((c) => c.email);
        const clientUsers = await userRepo
          .createQueryBuilder('u')
          .where('u.email IN (:...emails)', { emails: clientEmails })
          .getMany();
        const emailToFirebaseId = new Map(clientUsers.map((u) => [u.email, u.firebaseId]));
        clients = p.delegatedClients.map((c) => ({
          email: c.email,
          password: c.password,
          label: `${c.user.fName} ${c.user.lName}`,
          firebaseId: emailToFirebaseId.get(c.email),
        }));
      }

      out.push({
        id: p.id,
        label: p.label,
        description: p.description,
        email: p.email,
        password: p.password,
        exists: !!existing,
        firebaseId: existing?.firebaseId,
        clients,
      });
    }
    return out;
  }

  async seedProfile(profileId: string): Promise<DemoSeedResult> {
    const profile = this.findProfile(profileId);
    const userRepo = this.dataSource.getRepository(User);

    // 1. Pre-flight: every email this profile will create must be unused in DB.
    //    (Firebase will throw on its own if those uids already exist there.)
    const allEmails = [profile.email, ...(profile.delegatedClients?.map((c) => c.email) ?? [])];
    for (const email of allEmails) {
      const existing = await userRepo.findOne({ where: { email } });
      if (existing) {
        throw new ConflictException('המשתמש כבר קיים, יש ללחוץ על אפס תחילה');
      }
    }

    // 2. Create Firebase users — primary first, then each client. Track all
    //    UIDs so we can roll them all back if anything later fails.
    const createdFirebaseIds: string[] = [];
    const clientUids: { client: DemoClient; firebaseId: string }[] = [];

    let primaryFirebaseId: string;
    try {
      primaryFirebaseId = await this.createFirebaseUser(profile.email, profile.password, profile.user);
      createdFirebaseIds.push(primaryFirebaseId);

      for (const client of profile.delegatedClients ?? []) {
        const uid = await this.createFirebaseUser(client.email, client.password, client.user);
        createdFirebaseIds.push(uid);
        clientUids.push({ client, firebaseId: uid });
      }
    } catch (fbErr) {
      // Roll back any already-created Firebase users before bubbling up.
      for (const uid of createdFirebaseIds) {
        await admin.auth().deleteUser(uid).catch(() => undefined);
      }
      throw fbErr;
    }

    this.logger.log(
      `[demo-data] created ${createdFirebaseIds.length} firebase user(s) for profile ${profile.id}`,
    );

    // 3. DB inserts in a single transaction. Roll back ALL Firebase users on failure.
    try {
      await this.dataSource.transaction(async (m) => {
        // 3a. Primary user + their data.
        await this.seedUserAndData(m, primaryFirebaseId, profile, profile);

        // 3b. Each delegated client + Delegation row pointing to the primary as agent.
        for (const { client, firebaseId } of clientUids) {
          await this.seedUserAndData(m, firebaseId, client, profile);
          await m.save(
            m.create(Delegation, {
              userId: firebaseId,
              agentId: primaryFirebaseId,
              status: DelegationStatus.ACTIVE,
              externalCustomerId: null,
              scopes: [],
            }),
          );
        }

        // 3c. If primary is an accountant with delegated clients, set userCount
        //     on the User row (used elsewhere in the app for display).
        if (
          clientUids.length > 0 &&
          profile.role?.includes(UserRole.ACCOUNTANT)
        ) {
          await m.update(
            User,
            { firebaseId: primaryFirebaseId },
            { userCount: clientUids.length },
          );
        }
      });
    } catch (dbErr) {
      this.logger.error(
        `[demo-data] DB seed failed for ${profile.id}, rolling back ${createdFirebaseIds.length} firebase user(s): ${
          (dbErr as Error)?.message ?? dbErr
        }`,
      );
      for (const uid of createdFirebaseIds) {
        await admin.auth().deleteUser(uid).catch(() => undefined);
      }
      throw dbErr;
    }

    // 3.5 Documents + Expenses (opt-in per profile). Runs OUTSIDE the seed
    //     transaction because DocumentsService.createDoc() and
    //     ExpensesService.addExpense() each open their OWN transaction / use
    //     their own repos (they don't accept the seeder's EntityManager) —
    //     calling them inside `m` would run on a separate connection and could
    //     deadlock or orphan rows on rollback. Best-effort: failures are
    //     logged and the already-committed user/businesses stay valid.
    try {
      await this.seedDocumentsAndExpenses(primaryFirebaseId, profile);
    } catch (docErr) {
      this.logger.error(
        `[demo-data] document/expense seeding failed for ${profile.id} ` +
          `(user/businesses still committed): ${(docErr as Error)?.message ?? docErr}`,
      );
    }

    // 4. Drive provisioning + sample-file upload (opt-in per profile).
    //    Runs OUTSIDE the DB transaction so a Drive outage doesn't roll back
    //    the seed. Errors are caught and logged at ERROR level WITH the
    //    stack trace — the admin keeps a valid demo user even if Drive is
    //    down, and clicking "אפס נתוני בדיקה" from the dashboard re-runs
    //    this same code path to fill the gap.
    let driveInbox: DriveSeedInfo | undefined = undefined;
    if (profile.seedDriveFiles) {
      try {
        const result = await this.provisionDriveAndSamplesForProfile(primaryFirebaseId, profile);
        if (result) driveInbox = result;
      } catch (driveErr) {
        this.logger.error(
          `[demo-data] Drive provisioning FAILED for ${profile.id} ` +
            `(DB seed still committed — click "אפס נתוני בדיקה" to retry): ${
              (driveErr as Error)?.message ?? driveErr
            }`,
          (driveErr as Error)?.stack,
        );
      }
    }

    return {
      firebaseId: primaryFirebaseId,
      email: profile.email,
      password: profile.password,
      clients: clientUids.length
        ? clientUids.map(({ client, firebaseId }) => ({
            firebaseId,
            email: client.email,
            password: client.password,
            label: `${client.user.fName} ${client.user.lName}`,
          }))
        : undefined,
      driveInbox,
    };
  }

  /**
   * Seed real Documents + Expenses for a profile's primary user. Runs AFTER the
   * main seed transaction commits (see call site for why).
   *
   * Both paths post journal entries — income via createDoc (debit A/R 1000,
   * credit revenue 4000 + output VAT 2400; credit notes reverse), expense via
   * addExpense (debit expense 5000 + deductible VAT input 2410, credit 1000).
   * These REQUIRE the chart-of-accounts rows (1000, 2400, 2410, 4000, 5000) to
   * exist in default_booking_account — see backend/src/bookkeeping/account.seed.ts.
   * If they're missing: createDoc rolls back each document (its journal post is
   * NOT best-effort), and addExpense keeps the expense but skips the journal
   * line (its post IS best-effort). Every call below is wrapped best-effort so a
   * missing account / per-item failure logs and the rest of the seed continues.
   */
  private async seedDocumentsAndExpenses(
    firebaseId: string,
    profile: DemoProfile,
  ): Promise<void> {
    const docs = profile.documents ?? [];
    const expenses = profile.expenses ?? [];
    if (docs.length === 0 && expenses.length === 0) return;

    await this.warnIfChartOfAccountsMissing();

    // Pre-assign docNumbers before going parallel — sequential counter must be
    // stable regardless of which business processes first.
    const docsWithNumbers = docs.map((d, i) => ({ ...d, docNumber: 1001 + i }));

    // Collect distinct businesses across docs + expenses.
    const bizRefs = [...new Set([
      ...docs.map(d => d.businessNumberRef),
      ...expenses.map(e => e.businessNumberRef),
    ])];

    this.logger.log(
      `[demo-data] seeding ${docs.length} docs + ${expenses.length} expenses ` +
      `across ${bizRefs.length} businesses in parallel (expenses concurrency=5 per biz)`,
    );
    const t0 = Date.now();

    // Different businesses share no counter rows — run them fully in parallel.
    await Promise.all(bizRefs.map(async (bizRef) => {
      const bizDocs = docsWithNumbers.filter(d => d.businessNumberRef === bizRef);
      const bizExpenses = expenses.filter(e => e.businessNumberRef === bizRef);
      const tb = Date.now();

      // ── Documents: sequential within each business ─────────────────────────
      // Documents share a per-business generalDocIndex counter; concurrent calls
      // would serialize at the DB anyway, so sequential is simpler and safe.
      for (const d of bizDocs) {
        const sumWithVat = Number((d.sumAftDisBefVAT + d.vatSum).toFixed(2));
        const docData = {
          issuerBusinessNumber: d.businessNumberRef,
          recipientName: d.recipientName,
          recipientId: d.recipientId ?? null,
          docType: d.docType,
          docNumber: d.docNumber,
          docVatRate: d.vatSum > 0 ? 18 : 0,
          sumBefDisBefVat: d.sumAftDisBefVAT,
          disSum: 0,
          sumAftDisBefVAT: d.sumAftDisBefVAT,
          vatSum: d.vatSum,
          sumAftDisWithVAT: sumWithVat,
          withholdingTaxAmount: 0,
          docDate: d.docDate,
          valueDate: d.docDate,
        };
        try {
          await this.documentsService.createDoc(
            { docData, linesData: [], paymentData: [] },
            firebaseId,
            false,
          );
        } catch (err: any) {
          this.logger.warn(
            `[demo-data] createDoc failed for ${d.docType} #${d.docNumber} ` +
            `(biz ${bizRef}): ${err?.message ?? err}`,
          );
        }
      }

      // ── Expenses: worker-pool concurrency=5 within each business ──────────
      // Reads dominate; the journal-entry counter serializes at the DB level so
      // concurrency is safe — no duplicate entryNumbers, no lost updates.
      await this.runConcurrently(bizExpenses, 5, async (e) => {
        const dto: any = {
          supplier: e.merchantName,
          category: e.category ?? 'הוצאות',
          subCategory: e.subCategory ?? 'כללי',
          sum: e.sum,
          taxPercent: e.taxPercent ?? 100,
          vatPercent: e.vatPercent,
          date: e.expenseDate,
          reductionPercent: 0,
          isEquipment: e.isEquipment ?? false,
        };
        try {
          await this.expensesService.addExpense(dto, firebaseId, e.businessNumberRef, false);
        } catch (err: any) {
          this.logger.warn(
            `[demo-data] addExpense failed for "${e.merchantName}" ` +
            `(biz ${bizRef}): ${err?.message ?? err}`,
          );
        }
      });

      this.logger.log(
        `[demo-data] biz ${bizRef}: ${bizDocs.length} docs + ${bizExpenses.length} expenses done in ${Date.now() - tb}ms`,
      );
    }));

    this.logger.log(`[demo-data] seed complete in ${Date.now() - t0}ms`);
  }

  /**
   * Worker-pool concurrency helper — runs `fn` over every item with at most
   * `concurrency` calls in flight at once. Each worker pulls from a shared
   * queue until exhausted. Errors propagate individually (caught by callers).
   */
  private async runConcurrently<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) return;
    const queue = [...items];
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (queue.length > 0) {
          const item = queue.shift()!;
          await fn(item);
        }
      },
    );
    await Promise.all(workers);
  }

  /**
   * Diagnostic: warn loudly if the bookkeeping chart of accounts isn't populated.
   * Without these rows the ledger demo silently produces nothing (income docs
   * roll back, expense journal lines are skipped). Non-fatal.
   */
  private async warnIfChartOfAccountsMissing(): Promise<void> {
    try {
      const rows = await this.dataSource.getRepository(DefaultBookingAccount).find();
      const have = new Set(rows.map((r) => r.code));
      const missing = ['1000', '2400', '2410', '4000', '5000'].filter((c) => !have.has(c));
      if (missing.length) {
        this.logger.warn(
          `[demo-data][ledger] default_booking_account is missing codes [${missing.join(', ')}]. ` +
            `Income documents will roll back and expense journal lines will be skipped until these ` +
            `exist. See backend/src/bookkeeping/account.seed.ts for the SQL.`,
        );
      }
    } catch {
      // diagnostic only — never block seeding
    }
  }

  /**
   * In-app reset endpoint backing the "אפס נתוני בדיקה" dashboard button.
   * Called by a demo user logged in as themselves (NOT an admin). Wipes
   * every file out of Drive (inbox/processed) for every business,
   * purges OCR/expense/document rows, then re-creates the OB cache rows
   * from the profile and re-uploads the sample PDFs.
   *
   * Distinct from `resetProfile`, which destroys the user entirely
   * (Firebase + every DB row) — testReset preserves the user identity so
   * the caller's session stays valid; only the test-state derived data is
   * rewound.
   */
  async testReset(firebaseId: string): Promise<DemoTestResetResult> {
    console.log(`[test-reset] ENTRY fid=${firebaseId.substring(0, 8)}...`);

    const userRepo = this.dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { firebaseId } });
    if (!user) {
      console.log(`[test-reset] ABORT — user not found in DB for fid=${firebaseId.substring(0, 8)}...`);
      throw new NotFoundException('User not found');
    }
    console.log(`[test-reset] loaded user email=${user.email} index=${user.index}`);

    const profile = findDemoProfileByEmail(user.email);
    if (!profile) {
      console.log(`[test-reset] ABORT — email "${user.email}" not in DEMO_PROFILES`);
      throw new ForbiddenException(
        'אפס נתוני בדיקה זמין רק למשתמשי דמו',
      );
    }
    console.log(`[test-reset] resolved profile=${profile.id}`);

    const businessRepo = this.dataSource.getRepository(Business);
    const businesses = await businessRepo.find({ where: { firebaseId } });
    const businessNumbers = businesses
      .map((b) => b.businessNumber)
      .filter((n): n is string => !!n);
    console.log(`[test-reset] loaded ${businesses.length} business(es), businessNumbers=[${businessNumbers.join(',')}]`);

    // 1. Wipe every file from every demo Drive folder (inbox, processed).
    //    Per-folder + per-file errors are logged but never abort the wider
    //    reset — partial cleanup is better than no cleanup. Logs
    //    use console.error so they bypass NestJS log-level filtering during
    //    debugging; revert to logger.log once we trust the flow.
    console.log(`[test-reset] START drive cleanup for ${businesses.length} business(es)`);
    let filesDeleted = 0;
    for (const b of businesses) {
      const folderEntries: Array<{ name: 'inbox' | 'processed'; id: string | null }> = [
        { name: 'inbox',     id: b.driveInboxFolderId },
        { name: 'processed', id: b.driveProcessedFolderId },
      ];
      for (const { name, id: folderId } of folderEntries) {
        if (!folderId) {
          console.log(`[test-reset] biz=${b.businessNumber} ${name}: no folderId on Business row — skipping`);
          continue;
        }
        try {
          const files = await this.driveService.listFolderFiles(folderId);
          let deletedHere = 0;
          let failedHere = 0;
          for (const f of files) {
            try {
              await this.driveService.deleteFile(f.id);
              deletedHere++;
              filesDeleted++;
            } catch (delErr) {
              failedHere++;
              console.log(
                `[test-reset] biz=${b.businessNumber} ${name}: FAILED to delete "${f.name}" (${f.id}): ${
                  (delErr as Error)?.message ?? delErr
                }`,
              );
            }
          }
          console.log(
            `[test-reset] biz=${b.businessNumber} ${name}: listed=${files.length} deleted=${deletedHere} failed=${failedHere}`,
          );
        } catch (listErr) {
          console.log(
            `[test-reset] biz=${b.businessNumber} ${name}: list FAILED for folderId=${folderId}: ${
              (listErr as Error)?.message ?? listErr
            }`,
          );
        }
      }
    }

    // 2. Purge derived rows. Same FK-checks-off pattern as resetProfile so
    //    we don't trip over the document → expense chain.
    const dbRowsReset: Record<string, number> = {};
    await this.dataSource.transaction(async (m) => {
      await m.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        // Documents (issued by the user) — scoped by issuerBusinessNumber.
        if (businessNumbers.length > 0) {
          dbRowsReset.docLines =
            (await m.delete(DocLines, {
              issuerBusinessNumber: In(businessNumbers),
            })).affected ?? 0;
          dbRowsReset.docPayments =
            (await m.delete(DocPayments, {
              issuerBusinessNumber: In(businessNumbers),
            })).affected ?? 0;
          dbRowsReset.documents =
            (await m.delete(Documents, {
              issuerBusinessNumber: In(businessNumbers),
            })).affected ?? 0;
        }

        // ExtractedDocument is keyed by `userId = user.index` (an int) but
        // we wipe by `businessNumber` here. Every reseed of a demo profile
        // creates a new Firebase user with a fresh `index`; old rows from
        // previous incarnations stay behind and get re-paired by the matcher
        // (which queries by businessNumber), leaving the current user's
        // brand-new rows showing as doc_only in the review UI. Scoping by
        // businessNumber catches all those orphans at once.
        if (businessNumbers.length > 0) {
          dbRowsReset.extractedDocuments =
            (await m.delete(ExtractedDocument, {
              businessNumber: In(businessNumbers),
            })).affected ?? 0;
        }

        // Bookkeeping rows derived from the test data.
        dbRowsReset.expenses =
          (await m.delete(Expense, { userId: firebaseId })).affected ?? 0;
        dbRowsReset.incomes =
          (await m.delete(Income, { userId: firebaseId })).affected ?? 0;
        dbRowsReset.suppliers =
          (await m.delete(Supplier, { userId: firebaseId })).affected ?? 0;

        // Transaction chain — wipe then re-insert from profile.transactions
        // so daysAgo offsets get recomputed relative to today.
        dbRowsReset.slimTransactions =
          (await m.delete(SlimTransaction, { userId: firebaseId })).affected ?? 0;
        dbRowsReset.classifiedRules =
          (await m.delete(ClassifiedTransactions, { userId: firebaseId })).affected ?? 0;
        dbRowsReset.fullCache =
          (await m.delete(FullTransactionCache, { userId: firebaseId })).affected ?? 0;

        // Rebuild full_transaction_cache from the profile template — uses
        // the same shape as seedUserAndData's step 4 so dates anchor to
        // "today" again, and looks up live bill ids by name so the
        // pre-association survives the wipe.
        const rebuiltCacheRows = await this.buildCacheRowsFromProfile(m, firebaseId, profile);
        if (rebuiltCacheRows.length > 0) {
          await m.insert(FullTransactionCache, rebuiltCacheRows);
        }
        dbRowsReset.fullCacheReseeded = rebuiltCacheRows.length;
      } finally {
        await m.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    });

    // 3. Re-upload sample PDFs into the first business's inbox/. If the
    //    folder isn't provisioned yet (e.g. user signed in once without
    //    triggering provisioning), run the Drive provisioning now too.
    let driveInbox: DriveSeedInfo | undefined = undefined;
    if (profile.seedDriveFiles) {
      try {
        const result = await this.provisionDriveAndSamplesForProfile(firebaseId, profile);
        if (result) driveInbox = result;
      } catch (driveErr) {
        this.logger.warn(
          `[demo-data] testReset Drive upload failed for ${profile.id}: ${
            (driveErr as Error)?.message ?? driveErr
          }`,
        );
      }
    }

    const filesUploaded = driveInbox?.filesUploaded ?? 0;
    console.log(
      `[test-reset] DONE ${profile.id} fid=${firebaseId.substring(0, 8)}... | ` +
        `filesDeleted=${filesDeleted} filesUploaded=${filesUploaded} | dbRowsReset=${JSON.stringify(dbRowsReset)}`,
    );

    return { filesDeleted, dbRowsReset, filesUploaded, driveInbox };
  }

  async resetProfile(profileId: string): Promise<DemoResetResult> {
    const profile = this.findProfile(profileId);
    const userRepo = this.dataSource.getRepository(User);
    const primary = await userRepo.findOne({ where: { email: profile.email } });

    if (!primary) {
      // Orphan cleanup: maybe Firebase users exist without DB rows. Walk all
      // emails (primary + clients) and delete any orphan Firebase user.
      await this.deleteFirebaseUserByEmail(profile.email);
      for (const c of profile.delegatedClients ?? []) {
        await this.deleteFirebaseUserByEmail(c.email);
      }
      return { existed: false, deletedRows: {} };
    }

    // Resolve client firebaseIds from the DB by email.
    const clientUsers: User[] = [];
    for (const c of profile.delegatedClients ?? []) {
      const cu = await userRepo.findOne({ where: { email: c.email } });
      if (cu) clientUsers.push(cu);
    }

    const allFirebaseIds = [primary.firebaseId, ...clientUsers.map((u) => u.firebaseId)];
    const deleted: Record<string, number> = {};

    await this.dataSource.transaction(async (m) => {
      await m.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        // Purge clients first so Delegations on either side get caught.
        for (const cu of clientUsers) {
          await this.purgeUserData(m, cu.firebaseId, deleted);
        }
        await this.purgeUserData(m, primary.firebaseId, deleted);
      } finally {
        await m.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    });

    // Firebase deletes OUTSIDE the DB transaction.
    for (const uid of allFirebaseIds) {
      await admin.auth()
        .deleteUser(uid)
        .catch((e: any) => {
          if (e?.code !== 'auth/user-not-found') {
            this.logger.warn(`[demo-data] failed to delete firebase ${uid}: ${e?.message ?? e}`);
          }
        });
    }
    // Belt-and-braces: any clients that didn't have a DB row but might still
    // have a Firebase account.
    for (const c of profile.delegatedClients ?? []) {
      if (!clientUsers.some((u) => u.email === c.email)) {
        await this.deleteFirebaseUserByEmail(c.email);
      }
    }

    this.logger.log(
      `[demo-data] reset ${profile.id}: ${JSON.stringify(deleted)} (${allFirebaseIds.length} firebase user(s))`,
    );
    return { existed: true, deletedRows: deleted };
  }

  // ---------------- Internals ----------------

  private findProfile(id: string): DemoProfile {
    const profile = DEMO_PROFILES.find((p) => p.id === id);
    if (!profile) {
      throw new NotFoundException(`Demo profile "${id}" not found`);
    }
    return profile;
  }

  private async createFirebaseUser(
    email: string,
    password: string,
    user: { fName: string; lName: string },
  ): Promise<string> {
    try {
      const fb = await admin.auth().createUser({
        email,
        password,
        displayName: `${user.fName} ${user.lName}`,
        emailVerified: true,
      });
      return fb.uid;
    } catch (e: any) {
      if (e?.code === 'auth/email-already-exists') {
        throw new ConflictException(
          `המשתמש ${email} כבר קיים בפיירבייס - יש ללחוץ על אפס תחילה`,
        );
      }
      throw e;
    }
  }

  /**
   * Seed all DB rows for a single user (primary OR a delegated client):
   * User → Businesses → Bills + Sources → FullTransactionCache → UserSyncState.
   *
   * @param m TypeORM entity manager (must be inside a transaction).
   * @param firebaseId Firebase UID for this user.
   * @param data       The seedable slice (DemoProfile or DemoClient).
   * @param profile    The owning profile — used for the externalTransactionId
   *                   prefix so cache rows are easy to identify.
   */
  private async seedUserAndData(
    m: EntityManager,
    firebaseId: string,
    data: DemoSeedable,
    profile: DemoProfile,
  ): Promise<void> {
    const isPrimary = data.email === profile.email;
    const externalIdPrefix = isPrimary
      ? `demo-${profile.id}`
      : `demo-${profile.id}-${data.email.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;

    // Backdate createdAt so the auto-task generator's lookback window catches
    // past periods. The generator uses `max(business.createdAt, today - LOOKBACK)`
    // as its lower bound; without backdating, "createdAt = now()" would exclude
    // every past period and the משימות tab + workflows would be empty after a
    // fresh seed. 24 months covers PERIODIC_LOOKBACK_MONTHS (12) and lets the
    // ANNUAL_LOOKBACK_YEARS (5) horizon include last year's annual report task.
    const backdatedCreatedAt = new Date();
    backdatedCreatedAt.setUTCMonth(backdatedCreatedAt.getUTCMonth() - 24);

    // 1. User row — spouse fields mapped onto User.spouse* columns.
    await m.save(
      m.create(User, {
        firebaseId,
        email: data.email,
        fName: data.user.fName,
        lName: data.user.lName,
        id: data.user.id,
        gender: data.user.gender,
        dateOfBirth: new Date(data.user.dateOfBirth),
        phone: data.user.phone,
        city: data.user.city,
        employmentStatus: data.user.employmentStatus,
        familyStatus: data.user.familyStatus,
        role: data.role ?? [UserRole.REGULAR],
        businessStatus:
          data.businesses.length >= 2
            ? BusinessStatus.MULTI_BUSINESS
            : data.businesses.length === 1
              ? BusinessStatus.SINGLE_BUSINESS
              : BusinessStatus.NO_BUSINESS,
        // Default true for users with bank data; profile can opt out (e.g. an
        // accountant with no personal banking) by setting hasOpenBanking: false.
        hasOpenBanking: data.hasOpenBanking ?? true,
        createdAt: backdatedCreatedAt,
        spouseFName: data.spouse?.fName ?? null,
        spouseLName: data.spouse?.lName ?? null,
        spouseId: data.spouse?.id ?? null,
        spousePhone: data.spouse?.phone ?? null,
        spouseEmail: data.spouse?.email ?? null,
        spouseGender: data.spouse?.gender ?? null,
        spouseDateOfBirth: data.spouse
          ? new Date(data.spouse.dateOfBirth)
          : null,
        spouseEmploymentStatus: data.spouse?.employmentStatus ?? null,
      }),
    );

    // Subscription row — same trial-creation path as signup()/delegation, so
    // demo users get identical TRIAL/all-modules access to real users instead
    // of a hand-rolled modulesAccess list. Runs outside the `m` transaction
    // (BillingService manages its own repos) but is idempotent by firebaseId,
    // so a retry after a partial failure is safe.
    await this.usersService.ensureTrialSubscription(firebaseId);

    // 2. Businesses — apply VAT/tax defaults the way users.service.signup() does.
    for (const b of data.businesses) {
      await m.save(
        m.create(Business, {
          firebaseId,
          businessName: b.businessName,
          businessNumber: b.businessNumber,
          businessType: b.businessType,
          businessField: b.businessField ?? null,
          businessAddress: b.businessAddress ?? null,
          advanceTaxPercent: b.advanceTaxPercent ?? null,
          vatReportingType:
            b.businessType === BusinessType.EXEMPT
              ? VATReportingType.NOT_REQUIRED
              : VATReportingType.DUAL_MONTH_REPORT,
          taxReportingType: TaxReportingType.DUAL_MONTH_REPORT,
        }),
      );
    }

    // Force-backdate Business.createdAt — the entity uses `@CreateDateColumn`
    // which TypeORM auto-fills with NOW() on insert. We need it in the past so
    // the task generator's lookback enumerates historical VAT/advance-tax
    // periods + last year's annual report.
    if (data.businesses.length > 0) {
      await m.update(Business, { firebaseId }, { createdAt: backdatedCreatedAt });
    }

    // 3. Bills + Sources — build maps for transaction enrichment.
    const billIdByKey: Record<string, number> = {};
    const billNameByKey: Record<string, string> = {};
    const paymentIdentifierByBillKey: Record<string, string> = {};
    for (const bill of data.bills) {
      const saved = await m.save(
        m.create(Bill, {
          billName: bill.billName,
          userId: firebaseId,
          businessNumber: bill.businessNumberRef,
        }),
      );
      billIdByKey[bill.key] = saved.id;
      billNameByKey[bill.key] = bill.billName;
      const firstSource = bill.sources[0];
      if (firstSource) {
        paymentIdentifierByBillKey[bill.key] = firstSource.sourceName;
      }
      for (const s of bill.sources) {
        await m.save(
          m.create(Source, {
            userId: firebaseId,
            sourceName: s.sourceName,
            sourceType: s.sourceType,
            bill: saved,
          }),
        );
      }
    }

    // 3b. Standalone sources — orphan Source rows (bill: null) for the
    //     "OB-connected, no bills yet" profile. Without these, the
    //     associate-to-bill endpoint (POST /transactions/:billId/sources)
    //     refuses to attach because it expects the Source row to already
    //     exist from a prior OB sync.
    for (const s of data.standaloneSources ?? []) {
      await m.save(
        m.create(Source, {
          userId: firebaseId,
          sourceName: s.sourceName,
          sourceType: s.sourceType,
        }),
      );
    }

    // 4. FullTransactionCache rows — all unclassified for v1.
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    // Build rows sequentially with await — FX rate lookups go through
    // FxRateService which caches per (date, currency), so repeat calls
    // are cheap. Using the SAME rate source the OCR pipeline uses means
    // a demo USD transaction and an OCR'd USD invoice on the same date
    // end up with identical ilsAmount values — without this, the matcher
    // can't pair foreign-currency rows because both sides disagree by
    // whatever gap exists between the BOI live rate and any hardcoded
    // fallback we'd otherwise have used here.
    const cacheRows: Array<Partial<FullTransactionCache>> = [];
    for (let i = 0; i < data.transactions.length; i++) {
      const t = data.transactions[i];
      const txDate = new Date(todayUtc);
      txDate.setUTCDate(txDate.getUTCDate() - t.daysAgo);

      // billKey omitted → unassigned transaction (billId/billName null).
      // billKey set → pre-associate to that bill. The transaction's own
      // `paymentIdentifier` wins when explicitly set (so a single bill can
      // back multiple sources — typical: one bill with BANK + CARD sources,
      // each transaction tagged with the matching identifier). Only fall
      // back to the bill's first source when the transaction didn't carry
      // its own identifier.
      let billId: number | null = null;
      let billName: string | null = null;
      let paymentIdentifier: string | null = t.paymentIdentifier ?? null;
      if (t.billKey) {
        const resolved = billIdByKey[t.billKey];
        if (resolved === undefined) {
          throw new Error(
            `Transaction at index ${i} (user ${data.email}) references unknown billKey "${t.billKey}"`,
          );
        }
        billId = resolved;
        billName = billNameByKey[t.billKey] ?? null;
        if (paymentIdentifier == null) {
          paymentIdentifier = paymentIdentifierByBillKey[t.billKey] ?? null;
        }
      }

      const currency = t.currency ?? 'ILS';
      const fxRate =
        currency === 'ILS' ? null : await this.fxRateService.getRate(txDate, currency);
      const ilsAmount = fxRate != null ? Number((t.amount * fxRate).toFixed(2)) : null;
      cacheRows.push({
        externalTransactionId: `${externalIdPrefix}-${i}`,
        userId: firebaseId,
        billId,
        billName,
        businessNumber: t.businessNumberRef,
        merchantName: t.merchantName,
        paymentIdentifier,
        transactionDate: txDate,
        amount: t.amount,
        currency,
        ilsAmount,
        fxRateToIls: fxRate,
        confirmed: false,
        isRecognized: false,
        vatPercent: 0,
        taxPercent: 0,
        reductionPercent: 0,
        isEquipment: false,
      });
    }
    if (cacheRows.length > 0) {
      await m.insert(FullTransactionCache, cacheRows);
    }

    // 5. UserSyncState — seed a "completed" row for every Open-Banking user
    //    so the dashboard's transactions endpoint passes its sync-state gate.
    //    Includes profiles that have transactions but no bills yet (the user
    //    is expected to create the bills as part of the demo). Skip only for
    //    users who opted out of OB (e.g. an accountant with no personal banking).
    if (data.hasOpenBanking ?? true) {
      await m.insert(UserSyncState, {
        userId: firebaseId,
        triggeredBy: 'manual',
        fullProcessStatus: 'completed',
        fullResultStatus: 'success',
        fullRowsWritten: cacheRows.length,
        fullStartedAt: new Date(),
        fullFinishedAt: new Date(),
        lastSourcesRefreshAt: new Date(),
      });
    }
  }

  /**
   * Delete every DB row scoped to a single firebaseId. Counts accumulate into
   * the shared `deleted` map so the response shows the cumulative totals.
   */
  private async purgeUserData(
    m: EntityManager,
    firebaseId: string,
    deleted: Record<string, number>,
  ): Promise<void> {
    // Capture business numbers BEFORE deleting Business rows — Documents and
    // bookkeeping rows are scoped by `issuerBusinessNumber`, not by user.
    const businesses = await m.find(Business, { where: { firebaseId } });
    const businessNumbers = businesses
      .map((b) => b.businessNumber)
      .filter((n): n is string => !!n);

    const inc = async (key: string, n: Promise<number>): Promise<void> => {
      deleted[key] = (deleted[key] ?? 0) + (await n);
    };

    // Transactions / classification chain — scoped by userId.
    await inc('slimTransactions', this.deleteAndCount(m, SlimTransaction, { userId: firebaseId }));
    await inc('fullCache', this.deleteAndCount(m, FullTransactionCache, { userId: firebaseId }));
    await inc('classifiedRules', this.deleteAndCount(m, ClassifiedTransactions, { userId: firebaseId }));
    await inc('userTxCacheState', this.deleteAndCount(m, UserTransactionCacheState, { userId: firebaseId }));
    await inc('userSyncState', this.deleteAndCount(m, UserSyncState, { userId: firebaseId }));
    await inc('userSourceSyncState', this.deleteAndCount(m, UserSourceSyncState, { userId: firebaseId }));
    await inc('legacyTransactions', this.deleteAndCount(m, Transactions, { userId: firebaseId }));
    await inc('sources', this.deleteAndCount(m, Source, { userId: firebaseId }));
    await inc('bills', this.deleteAndCount(m, Bill, { userId: firebaseId }));

    // User-scoped categories.
    await inc('userCategories', this.deleteAndCount(m, UserCategory, { firebaseId }));
    await inc('userSubCategories', this.deleteAndCount(m, UserSubCategory, { firebaseId }));

    // Bookkeeping (mostly userId-scoped).
    await inc('expenses', this.deleteAndCount(m, Expense, { userId: firebaseId }));
    await inc('incomes', this.deleteAndCount(m, Income, { userId: firebaseId }));
    await inc('suppliers', this.deleteAndCount(m, Supplier, { userId: firebaseId }));
    await inc('bookkeepingClients', this.deleteAndCount(m, Clients, { userId: firebaseId }));
    await inc('settingDocuments', this.deleteAndCount(m, SettingDocuments, { userId: firebaseId }));

    // Documents + their child rows are scoped by `issuerBusinessNumber`.
    if (businessNumbers.length > 0) {
      await inc('docLines', this.deleteAndCount(m, DocLines, { issuerBusinessNumber: In(businessNumbers) }));
      await inc('docPayments', this.deleteAndCount(m, DocPayments, { issuerBusinessNumber: In(businessNumbers) }));
      await inc('documents', this.deleteAndCount(m, Documents, { issuerBusinessNumber: In(businessNumbers) }));
      await inc('journalLines', this.deleteAndCount(m, JournalLine, { issuerBusinessNumber: In(businessNumbers) }));
      await inc('journalEntries', this.deleteAndCount(m, JournalEntry, { issuerBusinessNumber: In(businessNumbers) }));
      // Also purge rows keyed by firebaseId (new rows created after the firebaseId column was added).
      // These may not match businessNumbers if businessNumber changed, or if this is a shared-number scenario.
      await inc('journalLines', this.deleteAndCount(m, JournalLine, { firebaseId }));
      await inc('journalEntries', this.deleteAndCount(m, JournalEntry, { firebaseId }));
      // Per-business journal running-number counter rows. These live in
      // SettingDocuments keyed on userId = businessNumber (NOT the firebaseId),
      // docType = JOURNAL_ENTRY — so the userId-scoped SettingDocuments delete
      // below misses them. Clear them here so a re-seed restarts entryNumber.
      await inc('journalCounters', this.deleteAndCount(m, SettingDocuments, { userId: In(businessNumbers), docType: DocumentType.JOURNAL_ENTRY }));
      // ExtractedDocument is OCR output keyed by businessNumber. Scoping by
      // businessNumber (not user.index) so re-seeds of a demo profile don't
      // leave orphans tied to the previous Firebase user's index — the
      // matcher reads by businessNumber and would otherwise pair stale
      // orphans with the new user's slim transactions.
      await inc('extractedDocuments', this.deleteAndCount(m, ExtractedDocument, { businessNumber: In(businessNumbers) }));
    }

    // Workflow / collaboration side.
    await inc('delegationsAsClient', this.deleteAndCount(m, Delegation, { userId: firebaseId }));
    await inc('delegationsAsAgent', this.deleteAndCount(m, Delegation, { agentId: firebaseId }));
    await inc('accountantTasksAsClient', this.deleteAndCount(m, AccountantTask, { clientFirebaseId: firebaseId }));
    await inc('accountantTasksAsAccountant', this.deleteAndCount(m, AccountantTask, { accountantFirebaseId: firebaseId }));
    await inc('reportWorkflows', this.deleteAndCount(m, ReportWorkflow, { clientFirebaseId: firebaseId }));

    // AnnualReportFile cascades through annual_report — raw query for the join.
    const arfResult = await m.query(
      'DELETE arf FROM annual_report_file arf JOIN annual_report ar ON ar.id = arf.annualReportId WHERE ar.clientFirebaseId = ?',
      [firebaseId],
    );
    deleted.annualReportFiles =
      (deleted.annualReportFiles ?? 0) +
      ((arfResult as { affectedRows?: number })?.affectedRows ?? 0);

    await inc('annualReports', this.deleteAndCount(m, AnnualReport, { clientFirebaseId: firebaseId }));

    // User-level.
    await inc('moduleSubscriptions', this.deleteAndCount(m, UserModuleSubscription, { firebaseId }));
    await inc('children', this.deleteAndCount(m, Child, { parentUserID: firebaseId }));
    await inc('businesses', this.deleteAndCount(m, Business, { firebaseId }));
    await inc('users', this.deleteAndCount(m, User, { firebaseId }));
  }

  private async deleteAndCount<T>(
    m: EntityManager,
    entity: new () => T,
    where: object,
  ): Promise<number> {
    try {
      const r = await m.delete(entity as any, where as any);
      return r.affected ?? 0;
    } catch (e: any) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return 0;
      throw e;
    }
  }

  /**
   * Provision Drive folders for the profile's primary user (idempotent
   * find-or-create) and upload every PDF in `profile.seedDriveFiles.sourceDir`
   * into the first business's inbox/. Returns the number of files uploaded.
   *
   * Called from both the initial seed (post-DB-commit) and the test-reset
   * endpoint (post-DB-wipe). Idempotent — re-running it on an already-
   * provisioned user just refreshes the inbox.
   *
   * Each step logs with `[demo-data][drive]` so a partial failure is easy
   * to trace from the backend log. An unrecoverable step (no user found,
   * no businesses, business-folder create throws, sample dir missing)
   * throws here and the caller decides whether to surface or swallow.
   */
  private async provisionDriveAndSamplesForProfile(
    firebaseId: string,
    profile: DemoProfile,
  ): Promise<DriveSeedInfo | null> {
    if (!profile.seedDriveFiles) {
      this.logger.log(
        `[demo-data][drive] profile ${profile.id} has no seedDriveFiles — skipping`,
      );
      return null;
    }

    const tag = `profile=${profile.id} fid=${firebaseId.substring(0, 8)}...`;
    this.logger.log(`[demo-data][drive] START ${tag}`);

    // ── Step 1: locate the User row written by the DB transaction. ──
    const userRepo = this.dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { firebaseId } });
    if (!user) {
      throw new Error(
        `[demo-data][drive] user ${firebaseId} not found in DB after seed — txn might not have committed`,
      );
    }
    this.logger.log(
      `[demo-data][drive] step 1: loaded User index=${user.index} email=${user.email} (existing driveFolderId=${user.driveFolderId ?? '∅'}) ${tag}`,
    );

    // ── Step 2: user-root Drive folder (find-or-create). ──
    const folderName = `${user.fName ?? ''} ${user.lName ?? ''}`.trim() || user.email;
    this.logger.log(
      `[demo-data][drive] step 2: createUserFolder name="${folderName}" share=${user.email} ${tag}`,
    );
    let userFolderId: string;
    try {
      userFolderId = await this.driveService.createUserFolder(folderName, user.email);
    } catch (err) {
      this.logger.error(
        `[demo-data][drive] step 2 FAILED ${tag}: ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack,
      );
      throw err;
    }
    this.logger.log(`[demo-data][drive] step 2 OK userFolderId=${userFolderId} ${tag}`);

    if (user.driveFolderId !== userFolderId) {
      await userRepo.update({ firebaseId }, { driveFolderId: userFolderId });
      this.logger.log(`[demo-data][drive] persisted user.driveFolderId=${userFolderId} ${tag}`);
    }

    // ── Step 3: load Businesses written by the same DB transaction. ──
    const businessRepo = this.dataSource.getRepository(Business);
    const businesses = await businessRepo.find({ where: { firebaseId } });
    this.logger.log(
      `[demo-data][drive] step 3: loaded ${businesses.length} business(es) for ${tag}`,
    );
    if (businesses.length === 0) {
      throw new Error(
        `[demo-data][drive] no Business rows for firebaseId=${firebaseId} — profile/seed bug, can't provision inbox`,
      );
    }

    // ── Step 4: per-business folder + inbox/processed sub-folders. ──
    let firstInboxFolderId: string | null = null;
    for (const b of businesses) {
      this.logger.log(
        `[demo-data][drive] step 4: ensureBusinessFolder biz=${b.businessNumber} name="${b.businessName}" under userFolderId=${userFolderId} ${tag}`,
      );
      let folders;
      try {
        folders = await this.driveService.ensureBusinessFolder(
          userFolderId,
          b.businessName,
        );
      } catch (err) {
        this.logger.error(
          `[demo-data][drive] step 4 FAILED for biz=${b.businessNumber} ("${b.businessName}") ${tag}: ${(err as Error)?.message ?? err}`,
          (err as Error)?.stack,
        );
        throw err;
      }
      this.logger.log(
        `[demo-data][drive] step 4 OK biz=${b.businessNumber} folderId=${folders.folderId} inbox=${folders.inboxFolderId} processed=${folders.processedFolderId} ${tag}`,
      );

      // Persist with a targeted update — avoids touching unrelated columns
      // (createdAt audit columns, etc.) that a full `.save(entity)` might.
      await businessRepo.update(
        { id: b.id },
        {
          driveFolderId: folders.folderId,
          driveInboxFolderId: folders.inboxFolderId,
          driveProcessedFolderId: folders.processedFolderId,
        },
      );

      if (firstInboxFolderId == null) firstInboxFolderId = folders.inboxFolderId;
    }

    if (!firstInboxFolderId) {
      throw new Error(
        `[demo-data][drive] no inbox folder resolved for ${firebaseId} after ensureBusinessFolder loop`,
      );
    }

    // ── Step 5: upload sample PDFs. ──
    this.logger.log(
      `[demo-data][drive] step 5: uploadSampleFiles inbox=${firstInboxFolderId} sourceDir=${profile.seedDriveFiles.sourceDir} ${tag}`,
    );
    const result = await this.uploadSampleFiles(
      firstInboxFolderId,
      profile.seedDriveFiles.sourceDir,
    );
    this.logger.log(
      `[demo-data][drive] step 5 OK uploaded=${result.uploaded} quotaBlocked=${result.quotaBlocked} ${tag}`,
    );
    this.logger.log(`[demo-data][drive] DONE ${tag}`);
    return {
      inboxFolderId: firstInboxFolderId,
      inboxFolderUrl: this.driveService.getFolderUrl(firstInboxFolderId),
      filesUploaded: result.uploaded,
      needsManualUpload: result.quotaBlocked,
    };
  }

  /**
   * Read every .pdf in `sourceDir` and upload it to `inboxFolderId`.
   * Resolves `sourceDir` against the current working directory first, then
   * one level up (covers both `backend/` and repo-root cwd in dev) and the
   * dist-relative fallback for prod. Skips silently if the directory can't
   * be found anywhere — the seed shouldn't blow up on a missing sample dir.
   */
  private async uploadSampleFiles(
    inboxFolderId: string,
    sourceDir: string,
  ): Promise<{ uploaded: number; quotaBlocked: boolean }> {
    const candidates = [
      path.resolve(process.cwd(), sourceDir),
      path.resolve(process.cwd(), '..', sourceDir),
      path.resolve(__dirname, '..', '..', '..', sourceDir),
    ];

    let resolvedDir: string | null = null;
    for (const c of candidates) {
      try {
        const stat = await fs.stat(c);
        if (stat.isDirectory()) { resolvedDir = c; break; }
      } catch {
        // not present — try the next candidate
      }
    }

    if (!resolvedDir) {
      this.logger.warn(
        `[demo-data] sample dir not found at any of: ${candidates.join(' | ')}`,
      );
      return { uploaded: 0, quotaBlocked: false };
    }

    const files = await fs.readdir(resolvedDir);
    let uploaded = 0;
    let quotaBlocked = false;
    for (const name of files) {
      if (!name.toLowerCase().endsWith('.pdf')) continue;
      try {
        const buf = await fs.readFile(path.join(resolvedDir, name));
        await this.driveService.uploadFile(inboxFolderId, name, buf, 'application/pdf');
        uploaded++;
      } catch (e) {
        if (e instanceof ServiceAccountQuotaError) {
          // First file hit the quota wall — every subsequent file will hit
          // the same error. Bail the loop instead of spamming the same
          // warning N times; the higher-level provisioning code surfaces a
          // single "drop them manually" message via the seed response.
          quotaBlocked = true;
          break;
        }
        this.logger.warn(
          `[demo-data] failed to upload sample "${name}": ${(e as Error)?.message ?? e}`,
        );
      }
    }
    if (quotaBlocked) {
      this.logger.warn(
        `[demo-data] sample upload skipped — service-account quota wall. ` +
          `Open the inbox folder in your Drive UI and drag the PDFs from ${resolvedDir} ` +
          `manually. (Folder id: ${inboxFolderId})`,
      );
      return { uploaded: 0, quotaBlocked: true };
    }
    this.logger.log(
      `[demo-data] uploaded ${uploaded} sample file(s) from ${resolvedDir} → ${inboxFolderId}`,
    );
    return { uploaded, quotaBlocked: false };
  }

  /**
   * Mirror of seedUserAndData step 4 — rebuild the FullTransactionCache
   * insert payload from a profile's `transactions` array. Shared between
   * the initial seed (called inline) and the test-reset endpoint (called
   * after wiping cache rows so daysAgo re-anchors to today). Mutating
   * either site means mutating both.
   */
  private async buildCacheRowsFromProfile(
    m: EntityManager,
    firebaseId: string,
    profile: DemoProfile,
  ): Promise<Array<Partial<FullTransactionCache>>> {
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const externalIdPrefix = `demo-${profile.id}`;

    // Resolve profile bill keys → live DB ids by billName (the only field
    // shared between the profile template and the DB row). The bills
    // survive testReset, so this lookup succeeds without re-creating them.
    const billIdByKey: Record<string, number> = {};
    const billNameByKey: Record<string, string> = {};
    const firstSourceByKey: Record<string, string> = {};
    if (profile.bills.length > 0) {
      const billNames = profile.bills.map((b) => b.billName);
      const dbBills = await m.find(Bill, {
        where: { userId: firebaseId, billName: In(billNames) },
      });
      const idByName = new Map(dbBills.map((b) => [b.billName, b.id]));
      for (const b of profile.bills) {
        const dbId = idByName.get(b.billName);
        if (dbId !== undefined) {
          billIdByKey[b.key] = dbId;
          billNameByKey[b.key] = b.billName;
          if (b.sources[0]) firstSourceByKey[b.key] = b.sources[0].sourceName;
        }
      }
    }

    // Sequential await — FX rates come from the same BOI-backed service
    // the OCR pipeline uses, so a USD demo tx on 2026-05-20 and a USD
    // OCR'd doc on 2026-05-20 land on the IDENTICAL ilsAmount. Without
    // matching rate sources, the matcher's ±1 NIS tolerance can't bridge
    // the gap between a hardcoded fallback and the live BOI rate.
    const out: Array<Partial<FullTransactionCache>> = [];
    for (let i = 0; i < profile.transactions.length; i++) {
      const t = profile.transactions[i];
      const txDate = new Date(todayUtc);
      txDate.setUTCDate(txDate.getUTCDate() - t.daysAgo);
      const currency = t.currency ?? 'ILS';
      const fxRate =
        currency === 'ILS' ? null : await this.fxRateService.getRate(txDate, currency);
      const ilsAmount = fxRate != null ? Number((t.amount * fxRate).toFixed(2)) : null;

      // Same precedence rule as seedUserAndData step 4: when billKey is
      // set, resolve to billId; transaction's own paymentIdentifier wins
      // over the bill's first source.
      let billId: number | null = null;
      let billName: string | null = null;
      let paymentIdentifier: string | null = t.paymentIdentifier ?? null;
      if (t.billKey && billIdByKey[t.billKey] !== undefined) {
        billId = billIdByKey[t.billKey];
        billName = billNameByKey[t.billKey] ?? null;
        if (paymentIdentifier == null) {
          paymentIdentifier = firstSourceByKey[t.billKey] ?? null;
        }
      }

      out.push({
        externalTransactionId: `${externalIdPrefix}-${i}`,
        userId: firebaseId,
        billId,
        billName,
        businessNumber: t.businessNumberRef,
        merchantName: t.merchantName,
        paymentIdentifier,
        transactionDate: txDate,
        amount: t.amount,
        currency,
        ilsAmount,
        fxRateToIls: fxRate,
        confirmed: false,
        isRecognized: false,
        vatPercent: 0,
        taxPercent: 0,
        reductionPercent: 0,
        isEquipment: false,
      } as Partial<FullTransactionCache>);
    }
    return out;
  }

  private async deleteFirebaseUserByEmail(email: string): Promise<void> {
    try {
      const fb = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(fb.uid);
    } catch (e: any) {
      if (e?.code !== 'auth/user-not-found') {
        this.logger.warn(
          `[demo-data] firebase orphan cleanup failed for ${email}: ${e?.message ?? e}`,
        );
      }
    }
  }
}
