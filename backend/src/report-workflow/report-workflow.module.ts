import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportWorkflow } from './report-workflow.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { AccountantTask } from 'src/accountant-tasks/accountant-task.entity';
import { ReportWorkflowController } from './report-workflow.controller';
import { ReportWorkflowService } from './report-workflow.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AccountantTasksModule } from 'src/accountant-tasks/accountant-tasks.module';
import { ReportsModule } from 'src/reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportWorkflow, Delegation, Business, AccountantTask]),
    NotificationsModule,
    // For TasksGeneratorService injected into ReportWorkflowService.listForClient.
    AccountantTasksModule,
    // For ReportsService.generateVatReportPdfBuffer used on submit.
    ReportsModule,
  ],
  controllers: [ReportWorkflowController],
  providers: [ReportWorkflowService],
  exports: [ReportWorkflowService],
})
export class ReportWorkflowModule {}
