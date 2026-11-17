import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountantTasksModule } from 'src/accountant-tasks/accountant-tasks.module';
import { BillingModule } from 'src/billing/billing.module';
import { BookkeepingModule } from 'src/bookkeeping/bookkeeping.module';
import { BusinessModule } from 'src/business/business.module';
import { ClientsModule } from 'src/clients/clients.module';
import { Delegation } from 'src/delegation/delegation.entity';
import { DocumentsModule } from 'src/documents/documents.module';
import { ExpensesModule } from 'src/expenses/expense.module';
import { ReportWorkflowModule } from 'src/report-workflow/report-workflow.module';
import { ReportsModule } from 'src/reports/reports.module';
import { SharedModule } from 'src/shared/shared.module';
import { TransactionsModule } from 'src/transactions/transactions.module';
import { User } from 'src/users/user.entity';
import { AgentBooksService } from './agent-books.service';
import { AgentClassificationService } from './agent-classification.service';
import { AgentDomainService } from './agent-domain.service';
import { AgentHarnessController } from './agent-harness.controller';
import { AgentHarnessService } from './agent-harness.service';

// The agent harness (backend/agent, KT-089): serves /api/agent/* through the
// agent package after FirebaseAuthGuard. Delegation and User are for the guard;
// the other modules back the agent's read-only domain tools
// (AgentDomainService: expenses; AgentBooksService: transactions, issued
// documents, categories, clients and reports).
@Module({
  imports: [
    TypeOrmModule.forFeature([Delegation, User]),
    ExpensesModule,
    BusinessModule,
    TransactionsModule,
    DocumentsModule,
    ClientsModule,
    BookkeepingModule,
    ReportsModule,
    ReportWorkflowModule,
    AccountantTasksModule,
    BillingModule,
    SharedModule,
  ],
  controllers: [AgentHarnessController],
  providers: [AgentHarnessService, AgentDomainService, AgentBooksService, AgentClassificationService],
})
export class AgentHarnessModule {}
