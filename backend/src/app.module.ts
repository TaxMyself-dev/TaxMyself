import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
//Modules
import { HttpModule } from '@nestjs/axios';
import { ClientsModule } from './clients/clients.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { ExpensesModule } from './expenses/expense.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CloudModule } from './cloud/cloud.module';
import { SharedModule } from './shared/shared.module';
import { FinsiteModule } from './finsite/finsite.module';
import { DelegationModule } from './delegation/delegation.module';
import { BookkeepingModule } from './bookkeeping/bookkeeping.module';
import { FeezbackModule } from './feezback/feezback.module';
import { FeezbackWebhookModule } from './feezback/webhook/feezback-webhook.module';
import { ShaamModule } from './shaam/shaam.module';
import { AccountantTasksModule } from './accountant-tasks/accountant-tasks.module';
import { AnnualReportModule } from './annual-report/annual-report.module';
import { ReportWorkflowModule } from './report-workflow/report-workflow.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DemoDataModule } from './demo-data/demo-data.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { BillingModule } from './billing/billing.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { DocumentImportModule } from './document-import/document-import.module';
import { InboundEmailModule } from './inbound-email/inbound-email.module';
import { InboundEmailAddress } from './inbound-email/inbound-email-address.entity';
//Integrations entities
import { UserIntegration } from './integrations/entities/user-integration.entity';
import { OauthState } from './integrations/entities/oauth-state.entity';
//Document import (shared intake pipeline) entities
import { ImportedDocument } from './document-import/entities/imported-document.entity';
//Billing entities
import { SubscriptionPlan } from './billing/entities/subscription-plan.entity';
import { Subscription } from './billing/entities/subscription.entity';
import { PaymentMethod } from './billing/entities/payment-method.entity';
import { CardcomWebhookLog } from './billing/entities/cardcom-webhook-log.entity';
import { BillingEvent } from './billing/entities/billing-event.entity';
//Entities
import { Expense } from './expenses/expenses.entity';
import { Income } from './expenses/incomes.entity';
import { Supplier } from './expenses/suppliers.entity';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: legacy entity still registered in root TypeORM config and global forFeature. Remove from entities array, from forFeature, and delete this import when legacy table is dropped.
import { Transactions } from './transactions/transactions.entity';
import { DefaultCategory } from './expenses/default-categories.entity';
import { DefaultSubCategory } from './expenses/default-sub-categories.entity';
import { UserCategory } from './expenses/user-categories.entity';
import { UserSubCategory } from './expenses/user-sub-categories.entity';
import { User } from './users/user.entity';
import { Child } from './users/child.entity';
import { Bill } from './transactions/bill.entity';
import { Source } from './transactions/source.entity';
import { ClassifiedTransactions } from './transactions/classified-transactions.entity';
import { SlimTransaction } from './transactions/slim-transaction.entity';
import { FullTransactionCache } from './transactions/full-transaction-cache.entity';
import { UserTransactionCacheState } from './transactions/user-transaction-cache-state.entity';
import { UserSyncState } from './transactions/user-sync-state.entity';
import { UserSourceSyncState } from './transactions/user-source-sync-state.entity';
import { Finsite } from './finsite/finsite.entity';
import { Delegation } from './delegation/delegation.entity';
import { Clients } from './clients/clients.entity';
import { Documents } from './documents/documents.entity';
import { DocLines } from './documents/doc-lines.entity';
import { DocPayments } from './documents/doc-payments.entity';
import { ExtractedDocument } from './documents/extracted-document.entity';
import { Business } from './business/business.entity';
import { FeezbackWebhookEvent } from './feezback/webhook/entities/feezback-webhook-event.entity';
import { UserModuleSubscription } from './users/user-module-subscription.entity';
import { AccountantTask } from './accountant-tasks/accountant-task.entity';
import { AnnualReport } from './annual-report/annual-report.entity';
import { AnnualReportFile } from './annual-report/annual-report-file.entity';
import { ReportWorkflow } from './report-workflow/report-workflow.entity';
import { FxRate } from './shared/fx-rate.entity';

import 'dotenv/config'
import * as admin from 'firebase-admin';
import { TransactionsService } from './transactions/transactions.service';
import { FinsiteService } from './finsite/finsite.service';
import { MailModule } from './mail/mail.module';
import { MailService } from './mail/mail.service';
import { SettingDocuments } from './documents/settingDocuments.entity';
import { DocumentsModule } from './documents/documents.module';
import { DocumentsService } from './documents/documents.service';
import { ClientsService } from './clients/clients.service';
import { JournalEntry } from './bookkeeping/jouranl-entry.entity';
import { JournalLine } from './bookkeeping/jouranl-line.entity';
import { BookingAccount } from './bookkeeping/account.entity';
import { AccountingSection } from './bookkeeping/accounting-section.entity';
import { AccountCodeMigration } from './bookkeeping/account-code-migration.entity';
import { Category } from './bookkeeping/category.entity';
import { SubCategory } from './bookkeeping/sub-category.entity';
import { BookkeepingService } from './bookkeeping/bookkeeping.service';
import { UsersService } from './users/users.service';
import { BusinessModule } from './business/business.module';
import { BusinessService } from './business/business.service';
import { DepreciationModule } from './depreciation/depreciation.module';
import { AssetDepreciationPosting } from './depreciation/asset-depreciation-posting.entity';


// Boot-time safety valve (added 2026-07-12 after an accidental synchronize
// run against keepintax_prodcopy dropped several unnamed unique/secondary
// indexes — see docs/redesign/schema-drift.md Gap 7). `synchronize` is only
// ever meant to run against keepintax-dev; refuse to even attempt a DB
// connection if it's enabled against anything whose name looks like a
// production/production-copy database, regardless of how NODE_ENV ended up
// unset — this must fail before TypeORM ever opens a connection, so it runs
// as plain top-level code (evaluated at module-load time, before Nest
// bootstraps), not inside a provider/guard.
//
// DISABLE_SYNCHRONIZE (added 2026-08-17 — dev-tooling hardening after the
// 4th variant of the same bug class: an import-script clobber, the catalog
// seeder null-ing fields on every boot [fixed 7d58a08b, unrelated to and
// unaffected by this change], the 2026-07-12 index-drop incident above, and
// most recently a long-lived `nest start --watch` process silently
// drop-and-recreating a column — and backfilling every row with its new
// default — the moment an entity's column type changed, with zero review).
// A dedicated flag rather than reusing NODE_ENV: NODE_ENV is also read
// directly in documents.service.ts, feezback.service.ts, and three dev-only
// endpoints in transactions.controller.ts, so repurposing it to kill
// synchronize locally would silently change unrelated behavior too. This
// flag controls synchronize and nothing else.
//
// Same "safe requires an explicit flag" shape as SKIP_BOOT_SEED: unset (or
// anything other than 'true') preserves the original NODE_ENV-only
// behavior — nothing breaks for an existing `nest start`/`npm start`
// invocation. `npm run start:watch` (backend/scripts/start-watch.js) is now
// the canonical way to run the live-reload dev server and sets
// DISABLE_SYNCHRONIZE=true by default, so the dangerous case (a background
// watcher silently altering the shared keepintax-dev schema on every save)
// can no longer happen through the recommended entry point.
//
// Escape hatch — genuinely need synchronize once (e.g. bootstrapping a
// fresh/scratch schema from nothing, as used for the seeder create-only-path
// verification): don't use start:watch. Run the nest CLI directly with
// DISABLE_SYNCHRONIZE left unset/false for that one boot, e.g.
//   DISABLE_SYNCHRONIZE=false DB_DATABASE=<scratch-db-name> npx nest start
// — a deliberate, named override, not an ambient default. (On Windows,
// npm's default script-shell doesn't support `VAR=value command` syntax —
// run that line from Git Bash, or set the env var as a separate PowerShell
// statement first: `$env:DISABLE_SYNCHRONIZE='false'`.)
const isSynchronizeEnabled = process.env.NODE_ENV !== 'production' && process.env.DISABLE_SYNCHRONIZE !== 'true';
if (isSynchronizeEnabled && /prod/i.test(process.env.DB_DATABASE || '')) {
  throw new Error(
    `Refusing to start: TypeORM synchronize is enabled (NODE_ENV=${JSON.stringify(process.env.NODE_ENV)}, ` +
    `DISABLE_SYNCHRONIZE=${JSON.stringify(process.env.DISABLE_SYNCHRONIZE)}) ` +
    `against DB_DATABASE=${JSON.stringify(process.env.DB_DATABASE)}, which looks like a production database. ` +
    `Set NODE_ENV=production or DISABLE_SYNCHRONIZE=true to disable synchronize, or point DB_DATABASE at keepintax-dev. ` +
    `See docs/redesign/schema-drift.md Gap 7 for why this guard exists.`,
  );
}

// "Which DB am I on?" should always be answerable at a glance — one line,
// every boot, right next to the guard above that depends on the same values.
new Logger('Bootstrap').log(
  `DB_DATABASE=${process.env.DB_DATABASE} synchronize=${isSynchronizeEnabled}`,
);

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [User, Child, , Business, Expense, Income, Supplier, Transactions, ClassifiedTransactions,
        SlimTransaction, FullTransactionCache, UserTransactionCacheState, UserSyncState, UserSourceSyncState,
        Bill, Source,
        DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory, Finsite, Delegation, SettingDocuments,
        Clients, Documents, DocLines, DocPayments, ExtractedDocument, JournalEntry, JournalLine, BookingAccount,
        AccountingSection, AccountCodeMigration, Category, SubCategory,
        FeezbackWebhookEvent, UserModuleSubscription, AccountantTask, AnnualReport, AnnualReportFile, ReportWorkflow,
        FxRate,
        SubscriptionPlan, Subscription, PaymentMethod, CardcomWebhookLog, BillingEvent,
        UserIntegration, OauthState, ImportedDocument, InboundEmailAddress,
        AssetDepreciationPosting,
        ],
      synchronize: isSynchronizeEnabled,
      timezone: 'Z',
      //logging: true
    }),
    TypeOrmModule.forFeature([
      User,
      Business,
      Supplier,
      Transactions,
      ClassifiedTransactions,
      SlimTransaction,
      FullTransactionCache,
      UserTransactionCacheState,
      Bill,
      Source,
      Expense,
      // (Phase 4.6: the four legacy catalog entities left this forFeature —
      // no provided service injects their repos anymore. They stay in the
      // forRoot entities list above only so the frozen tables remain
      // schema-managed for rollback until the Phase 7 drop.)
      Finsite,
      Delegation,
      SettingDocuments,
      Clients,
      Documents,
      DocLines,
      DocPayments,
      JournalEntry,
      JournalLine,
      BookingAccount,
      Child,
      FeezbackWebhookEvent,
      ExtractedDocument,
      ReportWorkflow,
    ]),
    ScheduleModule.forRoot(),
    HttpModule, UsersModule, ReportsModule, ExpensesModule, TransactionsModule, BusinessModule, CloudModule, SharedModule, FinsiteModule, MailModule, DelegationModule, DocumentsModule, ClientsModule, BookkeepingModule, FeezbackModule, ShaamModule, FeezbackWebhookModule, AccountantTasksModule, AnnualReportModule, ReportWorkflowModule, NotificationsModule, DemoDataModule, GoogleDriveModule, BillingModule, IntegrationsModule, DocumentImportModule, InboundEmailModule, DepreciationModule],
  controllers: [AppController],
  providers: [AppService, FinsiteService, MailService, DocumentsService, ClientsService, BookkeepingService, BusinessService],
})
export class AppModule {

  constructor() {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '')
          .replace(/\\n/g, '\n')
          .replace(/^"|"$/g, ''),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }
}
