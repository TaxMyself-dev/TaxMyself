//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
//Entities
import { Transactions } from 'src/transactions/transactions.entity';
import { Expense } from '../expenses/expenses.entity';
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
import { ExpensesService } from '../expenses/expenses.service';
import { UsersService } from '../users/users.service';
import { DefaultCategory } from '../expenses/default-categories.entity';
import { UserCategory } from '../expenses/user-categories.entity';
import { TransactionsService } from 'src/transactions/transactions.service';
import { FinsiteService } from 'src/finsite/finsite.service';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity';
import { DocPayments } from 'src/documents/doc-payments.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Transactions, Expense, DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory, 
                                      ClassifiedTransactions, Bill, Source, Supplier, User, Child, Finsite, Documents, DocLines, DocPayments, 
                                      Delegation, JournalEntry, JournalLine, DefaultBookingAccount]),
            SharedModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExpensesService, UsersService, TransactionsService, FinsiteService]
})
export class ReportsModule {}