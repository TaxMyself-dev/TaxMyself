import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Report } from './report.entity';
import { ExpensesService } from 'src/expenses/expenses.service';
import { Expense } from 'src/expenses/expenses.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report,Expense])],
  controllers: [ReportsController],
  providers: [ReportsService, ExpensesService]
})
export class ReportsModule {}
