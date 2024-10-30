//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
//Entities
import { Expense } from '../expenses/expenses.entity';
import { DefaultSubCategory } from '../expenses/default-sub-categories.entity';
import { UserSubCategory } from '../expenses/user-sub-categories.entity';
import { Supplier } from '../expenses/suppliers.entity';
import { User } from '../users/user.entity';
import { Child } from '../users/child.entity';
//Controllers
import { ReportsController } from './reports.controller';
//Services
import { ReportsService } from './reports.service';
import { ExpensesService } from '../expenses/expenses.service';
import { UsersService } from '../users/users.service';
import { DefaultCategory } from '../expenses/default-categories.entity';
import { UserCategory } from '../expenses/user-categories.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Expense, DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory, Supplier, User, Child]),
            SharedModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExpensesService, UsersService]
})
export class ReportsModule {}