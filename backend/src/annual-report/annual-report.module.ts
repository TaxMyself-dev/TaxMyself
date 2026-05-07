import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnualReport } from './annual-report.entity';
import { AnnualReportFile } from './annual-report-file.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { AccountantTask } from 'src/accountant-tasks/accountant-task.entity';
import { AnnualReportController } from './annual-report.controller';
import { AnnualReportService } from './annual-report.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnnualReport,
      AnnualReportFile,
      Delegation,
      Business,
      AccountantTask,
    ]),
  ],
  controllers: [AnnualReportController],
  providers: [AnnualReportService],
  exports: [AnnualReportService],
})
export class AnnualReportModule {}
