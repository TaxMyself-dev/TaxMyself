//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
//Entities
import { Expense } from 'src/expenses/expenses.entity';
import { DefaultCategory } from 'src/expenses/categories.entity';
import { Supplier } from 'src/expenses/suppliers.entity';
//Controllers
import { ReportsController } from './reports.controller';
//Services
import { ReportsService } from './reports.service';
import { ExpensesService } from 'src/expenses/expenses.service';


@Module({
  imports: [TypeOrmModule.forFeature([Expense, DefaultCategory, Supplier])],
  controllers: [ReportsController],
  providers: [ReportsService, ExpensesService]
})
export class ReportsModule {}