import { Module } from '@nestjs/common';
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
//Billing entities
import { SubscriptionPlan } from './billing/entities/subscription-plan.entity';
import { Subscription } from './billing/entities/subscription.entity';
import { PaymentMethod } from './billing/entities/payment-method.entity';
import { CardcomCheckoutSession } from './billing/entities/cardcom-checkout-session.entity';
import { CardcomWebhookLog } from './billing/entities/cardcom-webhook-log.entity';
import { BillingEvent } from './billing/entities/billing-event.entity';
import { Promotion } from './billing/entities/promotion.entity';
import { PromotionPlan } from './billing/entities/promotion-plan.entity';
import { Coupon } from './billing/entities/coupon.entity';
import { CouponPlan } from './billing/entities/coupon-plan.entity';
import { CouponRedemption } from './billing/entities/coupon-redemption.entity';
import { SubscriptionDiscount } from './billing/entities/subscription-discount.entity';
import { SubscriptionCancellation } from './billing/entities/subscription-cancellation.entity';
import { SubscriptionPlanChange } from './billing/entities/subscription-plan-change.entity';
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
import { ExpensesService } from './expenses/expenses.service';
import { MailModule } from './mail/mail.module';
import { MailService } from './mail/mail.service';
import { SettingDocuments } from './documents/settingDocuments.entity';
import { DocumentsModule } from './documents/documents.module';
import { DocumentsService } from './documents/documents.service';
import { ClientsService } from './clients/clients.service';
import { JournalEntry } from './bookkeeping/jouranl-entry.entity';
import { JournalLine } from './bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from './bookkeeping/account.entity';
import { BookkeepingService } from './bookkeeping/bookkeeping.service';
import { UsersService } from './users/users.service';
import { BusinessModule } from './business/business.module';
import { BusinessService } from './business/business.service';


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
        Clients, Documents, DocLines, DocPayments, ExtractedDocument, JournalEntry, JournalLine, DefaultBookingAccount,
        FeezbackWebhookEvent, UserModuleSubscription, AccountantTask, AnnualReport, AnnualReportFile, ReportWorkflow,
        FxRate,
        SubscriptionPlan, Subscription, PaymentMethod, CardcomCheckoutSession, CardcomWebhookLog,
        BillingEvent, Promotion, PromotionPlan, Coupon, CouponPlan, CouponRedemption,
        SubscriptionDiscount, SubscriptionCancellation, SubscriptionPlanChange],
      synchronize: process.env.NODE_ENV !== 'production',
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
      DefaultCategory,
      UserCategory,
      DefaultSubCategory,
      UserSubCategory,
      Finsite,
      Delegation,
      SettingDocuments,
      Clients,
      Documents,
      DocLines,
      DocPayments,
      JournalEntry,
      JournalLine,
      DefaultBookingAccount,
      Child,
      FeezbackWebhookEvent,
      ExtractedDocument,
    ]),
    ScheduleModule.forRoot(),
    HttpModule, UsersModule, ReportsModule, ExpensesModule, TransactionsModule, BusinessModule, CloudModule, SharedModule, FinsiteModule, MailModule, DelegationModule, DocumentsModule, ClientsModule, BookkeepingModule, FeezbackModule, ShaamModule, FeezbackWebhookModule, AccountantTasksModule, AnnualReportModule, ReportWorkflowModule, NotificationsModule, DemoDataModule, GoogleDriveModule, BillingModule],
  controllers: [AppController],
  providers: [AppService, FinsiteService, ExpensesService, MailService, DocumentsService, ClientsService, BookkeepingService, BusinessService],
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