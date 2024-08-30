//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from 'src/shared/shared.module';
//Entities
import { Expense } from 'src/expenses/expenses.entity';
import { DefaultSubCategory } from 'src/expenses/default-sub-categories.entity';
import { UserSubCategory } from 'src/expenses/user-sub-categories.entity';
import { Supplier } from 'src/expenses/suppliers.entity';
import { User } from 'src/users/user.entity';
import { Child } from 'src/users/child.entity';
//Controllers
import { ReportsController } from './reports.controller';
//Services
import { ReportsService } from './reports.service';
import { ExpensesService } from 'src/expenses/expenses.service';
import { UsersService } from 'src/users/users.service';
import { Category } from 'src/expenses/categories.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Expense, Category, DefaultSubCategory, UserSubCategory, Supplier, User, Child]),
            SharedModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExpensesService, UsersService]
})
export class ReportsModule {}