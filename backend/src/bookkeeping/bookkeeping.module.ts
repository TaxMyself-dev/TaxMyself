import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { BookkeepingService,  } from './bookkeeping.service';
import { BookkepingController } from './bookkeeping.controller';
import { JournalEntry } from './jouranl-entry.entity';
import { JournalLine } from './jouranl-line.entity';
import { SharedService } from 'src/shared/shared.service';
import { DefaultBookingAccount } from './account.entity';
import { Expense } from 'src/expenses/expenses.entity';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: wiring leftover — Transactions is registered in forFeature to satisfy SharedService injection (SharedService requires transactionRepository). Not used directly by BookkeepingService. Remove import and Transactions from forFeature once SharedService no longer needs it.
import { Transactions } from 'src/transactions/transactions.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry, JournalLine, DefaultBookingAccount, Expense, Transactions, SettingDocuments])],
  controllers: [BookkepingController],
  providers: [
    BookkeepingService,
    SharedService
  ],
})
export class BookkeepingModule {}