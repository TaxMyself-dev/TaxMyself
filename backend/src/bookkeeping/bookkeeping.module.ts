import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { BookkeepingService,  } from './bookkeeping.service';
import { AccountSeedService } from './account-seed.service';
import { AccountCodeAllocatorService } from './account-code-allocator.service';
import { BookkepingController } from './bookkeeping.controller';
import { JournalEntry } from './jouranl-entry.entity';
import { JournalLine } from './jouranl-line.entity';
import { SharedService } from 'src/shared/shared.service';
import { BookingAccount } from './account.entity';
import { AccountingSection } from './accounting-section.entity';
import { AccountCodeMigration } from './account-code-migration.entity';
import { Category } from './category.entity';
import { SubCategory } from './sub-category.entity';
import { CatalogService } from './catalog.service';
import { Expense } from 'src/expenses/expenses.entity';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: wiring leftover — Transactions is registered in forFeature to satisfy SharedService injection (SharedService requires transactionRepository). Not used directly by BookkeepingService. Remove import and Transactions from forFeature once SharedService no longer needs it.
import { Transactions } from 'src/transactions/transactions.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
// FirebaseAuthGuard (used on the new manual-journal-entry endpoint) needs these two
// repositories injectable in this module's context.
import { User } from 'src/users/user.entity';
import { Delegation } from 'src/delegation/delegation.entity';
// getVatReportingPeriods needs the business's businessType/vatReportingType.
import { Business } from 'src/business/business.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry, JournalLine, BookingAccount, AccountingSection, AccountCodeMigration, Category, SubCategory, Expense, Transactions, SettingDocuments, User, Delegation, Business])],
  controllers: [BookkepingController],
  providers: [
    BookkeepingService,
    AccountSeedService,
    AccountCodeAllocatorService,
    CatalogService,
    SharedService
  ],
  exports: [BookkeepingService, AccountCodeAllocatorService, CatalogService],
})
export class BookkeepingModule {}