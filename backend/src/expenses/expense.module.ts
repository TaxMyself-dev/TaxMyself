//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
//Entities
import { Expense } from './expenses.entity';
import { User } from '../users/user.entity';
import { Supplier } from './suppliers.entity';
//Controllers
import { ExpensesController } from './expenses.controller';
//Services
import { ExpensesService } from './expenses.service';
import { AuthService } from '../users/auth.service';
import { UsersModule } from '../users/users.module';
import { Child } from '../users/child.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { ExtractedDocument } from '../documents/extracted-document.entity';
// ENTITY-only registration for the D10 period-lock check — importing
// ReportWorkflowModule here would be cyclic (ReportWorkflowModule →
// ReportsModule → ExpensesModule).
import { ReportWorkflow } from '../report-workflow/report-workflow.entity';
import { BillingModule } from '../billing/billing.module';
// ExpensesService now posts a journal entry on expense create — needs BookkeepingService.
import { BookkeepingModule } from '../bookkeeping/bookkeeping.module';

@Module({
  imports: [
    // Phase 4.6: the four legacy catalog entities (Default/UserCategory,
    // Default/UserSubCategory) are gone from this list — ExpensesService no
    // longer injects any of their repos.
    TypeOrmModule.forFeature([Expense, User, Business, Supplier, Child, Delegation, ClassifiedTransactions, ExtractedDocument, ReportWorkflow]),
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
