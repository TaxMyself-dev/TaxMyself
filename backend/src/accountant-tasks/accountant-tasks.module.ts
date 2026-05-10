import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountantTask } from './accountant-task.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { User } from 'src/users/user.entity';
import { AnnualReport } from 'src/annual-report/annual-report.entity';
import { ReportWorkflow } from 'src/report-workflow/report-workflow.entity';
import { AccountantTasksController } from './accountant-tasks.controller';
import { AccountantTasksService } from './accountant-tasks.service';
import { TasksGeneratorService } from './tasks-generator.service';
import { UsersModule } from 'src/users/users.module';
import { SharedModule } from 'src/shared/shared.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountantTask,
      Delegation,
      Business,
      User,
      AnnualReport,
      ReportWorkflow,
    ]),
    UsersModule,
    SharedModule,
    NotificationsModule,
  ],
  controllers: [AccountantTasksController],
  providers: [AccountantTasksService, TasksGeneratorService],
  exports: [TasksGeneratorService],
})
export class AccountantTasksModule {}
