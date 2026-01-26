import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { DocumentsService,  } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SettingDocuments } from './settingDocuments.entity';
import { Documents } from './documents.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { DocLines } from './doc-lines.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity';
import { SharedService } from 'src/shared/shared.service';
import { Expense } from 'src/expenses/expenses.entity';
import { Transactions } from 'src/transactions/transactions.entity';
import { BookkeepingService } from 'src/bookkeeping/bookkeeping.service';
import { DocPayments } from './doc-payments.entity';
import { Business } from 'src/business/business.entity';
import { BusinessService } from 'src/business/business.service';


@Module({
  imports: [TypeOrmModule.forFeature([SettingDocuments, Documents, Expense, Transactions, DocLines, DocPayments, Business, Delegation, JournalEntry, JournalLine, DefaultBookingAccount])],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    SharedService,
    BookkeepingService,
    BusinessService
  ],
  exports: [DocumentsService], // Export DocumentsService for use in other modules
})
export class DocumentsModule {}