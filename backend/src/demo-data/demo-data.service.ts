import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import * as admin from 'firebase-admin';
import {
  BusinessStatus,
  BusinessType,
  ModuleName,
  PayStatus,
  TaxReportingType,
  UserRole,
  VATReportingType,
} from 'src/enum';
import { User } from 'src/users/user.entity';
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
import { Clients } from 'src/clients/clients.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { UserModuleSubscription } from 'src/users/user-module-subscription.entity';
import { Child } from 'src/users/child.entity';
import { AccountantTask } from 'src/accountant-tasks/accountant-task.entity';
import { ReportWorkflow } from 'src/report-workflow/report-workflow.entity';
import { AnnualReport } from 'src/annual-report/annual-report.entity';
import { DEMO_PROFILES } from './profiles';
import { DemoClient, DemoProfile, DemoSeedable } from './demo-profile.types';

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
}

export interface DemoResetResult {
  existed: boolean;
  deletedRows: Record<string, number>;
}

@Injectable()
export class DemoDataService {
  private readonly logger = new Logger(DemoDataService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
    };
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
        payStatus: PayStatus.TRIAL,
        // Keep modulesAccess consistent with hasOpenBanking — otherwise the
        // frontend sees hasOpenBanking=true and tries to poll OB-gated
        // endpoints that fail because modulesAccess lacks OPEN_BANKING.
        modulesAccess: (data.hasOpenBanking ?? true)
          ? [ModuleName.INVOICES, ModuleName.OPEN_BANKING]
          : [ModuleName.INVOICES],
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

    // 4. FullTransactionCache rows — all unclassified for v1.
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const cacheRows = data.transactions.map((t, i) => {
      const txDate = new Date(todayUtc);
      txDate.setUTCDate(txDate.getUTCDate() - t.daysAgo);
      const billId = billIdByKey[t.billKey];
      if (billId === undefined) {
        throw new Error(
          `Transaction at index ${i} (user ${data.email}) references unknown billKey "${t.billKey}"`,
        );
      }
      return {
        externalTransactionId: `${externalIdPrefix}-${i}`,
        userId: firebaseId,
        billId,
        billName: billNameByKey[t.billKey] ?? null,
        businessNumber: t.businessNumberRef,
        merchantName: t.merchantName,
        paymentIdentifier: paymentIdentifierByBillKey[t.billKey] ?? null,
        transactionDate: txDate,
        amount: t.amount,
        currency: 'ILS',
        confirmed: false,
        isRecognized: false,
        vatPercent: 0,
        taxPercent: 0,
        reductionPercent: 0,
        isEquipment: false,
      };
    });
    if (cacheRows.length > 0) {
      await m.insert(FullTransactionCache, cacheRows);
    }

    // 5. UserSyncState — seed a "completed" row for users with bank data so the
    //    dashboard's transactions endpoint passes its sync-state gate. Skip
    //    for users without bills (e.g. an accountant with no personal banking).
    if (data.bills.length > 0) {
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
