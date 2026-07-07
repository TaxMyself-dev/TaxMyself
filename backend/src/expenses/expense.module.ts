//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
//Entities
import { Expense } from './expenses.entity';
import { User } from '../users/user.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { Supplier } from './suppliers.entity';
import { UserSubCategory } from './user-sub-categories.entity';
//Controllers
import { ExpensesController } from './expenses.controller';
//Services
import { ExpensesService } from './expenses.service';
import { AuthService } from '../users/auth.service';
import { UsersModule } from '../users/users.module';
import { Child } from '../users/child.entity';
import { DefaultCategory } from './default-categories.entity';
import { UserCategory } from './user-categories.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { BillingModule } from '../billing/billing.module';
// ExpensesService now posts a journal entry on expense create — needs BookkeepingService.
import { BookkeepingModule } from '../bookkeeping/bookkeeping.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense, User, Business, DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory, Supplier, Child, Delegation, ClassifiedTransactions, ExtractedDocument]),
    SharedModule,
    UsersModule,
    BillingModule,
    BookkeepingModule
  ],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    AuthService,
  ],
  // Exported so other modules (e.g. DemoDataModule's seeder) can call addExpense.
  exports: [ExpensesService],
})
export class ExpensesModule {}
