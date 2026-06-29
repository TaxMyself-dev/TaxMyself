//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
//Entities
import { Expense } from '../expenses/expenses.entity';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { DefaultSubCategory } from '../expenses/default-sub-categories.entity';
import { UserSubCategory } from '../expenses/user-sub-categories.entity';
import { ClassifiedTransactions } from 'src/transactions/classified-transactions.entity';
import { Bill } from 'src/transactions/bill.entity';
import { Source } from 'src/transactions/source.entity';
import { Supplier } from '../expenses/suppliers.entity';
import { User } from '../users/user.entity';
import { Child } from '../users/child.entity';
import { Finsite } from 'src/finsite/finsite.entity';
import { Documents } from 'src/documents/documents.entity';
import { DocLines } from 'src/documents/doc-lines.entity';
import { Delegation } from 'src/delegation/delegation.entity';
//Controllers
import { ReportsController } from './reports.controller';
//Services
import { ReportsService } from './reports.service';
import { ReportReviewService } from './report-review.service';
import { MatchingService } from './matching.service';
import { ExpensesService } from '../expenses/expenses.service';
import { UsersModule } from '../users/users.module';
import { DocumentsModule } from '../documents/documents.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { DefaultCategory } from '../expenses/default-categories.entity';
import { UserCategory } from '../expenses/user-categories.entity';
import { FinsiteService } from 'src/finsite/finsite.service';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity';
import { DocPayments } from 'src/documents/doc-payments.entity';
import { Business } from 'src/business/business.entity';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, Expense, DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory,
                                      ClassifiedTransactions, Bill, Source, Supplier, User, Child, Finsite, Documents, DocLines, DocPayments,
                                      Delegation, JournalEntry, JournalLine, DefaultBookingAccount,
                                      SlimTransaction, FullTransactionCache, ExtractedDocument]),
    SharedModule,
    UsersModule,
    // DocumentsService is needed by ReportReviewService to trigger inbox
    // processing + per-row archive/reject. Imported (not re-provided) so we
    // share the same instance as DocumentsModule consumers.
    DocumentsModule,
    // GoogleDriveModule for Drive reads in the review flow (e.g. listing
    // the inbox folder's files).
    GoogleDriveModule,
    BillingModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportReviewService,
    MatchingService,
    ExpensesService,
    FinsiteService,
  ],
  exports: [ReportsService, ReportReviewService],
})
export class ReportsModule {}