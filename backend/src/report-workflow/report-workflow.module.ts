import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportWorkflow } from './report-workflow.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { AccountantTask } from 'src/accountant-tasks/accountant-task.entity';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { User } from 'src/users/user.entity';
import { ReportWorkflowController } from './report-workflow.controller';
import { ReportWorkflowService } from './report-workflow.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AccountantTasksModule } from 'src/accountant-tasks/accountant-tasks.module';
import { ReportsModule } from 'src/reports/reports.module';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportWorkflow,
      Delegation,
      Business,
      AccountantTask,
      SlimTransaction,
      FullTransactionCache,
      User,
    ]),
    NotificationsModule,
    // For TasksGeneratorService injected into ReportWorkflowService.listForClient.
    AccountantTasksModule,
    // For ReportsService.generateVatReportPdfBuffer used on submit.
    ReportsModule,
    // For SharedService.getVATReportingDate used to label locked transactions.
    SharedModule,
  ],
  controllers: [ReportWorkflowController],
  providers: [ReportWorkflowService],
  exports: [ReportWorkflowService],
})
export class ReportWorkflowModule {}
