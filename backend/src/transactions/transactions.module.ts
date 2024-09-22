import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuthService } from '../users/auth.service';
import { Expense } from '../expenses/expenses.entity';
import { User } from '../users/user.entity';
import { Transactions } from './transactions.entity';
import { UsersService } from '../users/users.service';
import { Child } from '../users/child.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { SharedService } from '../shared/shared.service';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { ExpensesService } from '../expenses/expenses.service';
import { UserSubCategory } from '../expenses/user-sub-categories.entity';
import { DefaultSubCategory } from '../expenses/default-sub-categories.entity';
import { Supplier } from '../expenses/suppliers.entity';
import { Category } from '../expenses/categories.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, User, Transactions, Category, DefaultSubCategory, UserSubCategory, Supplier, ClassifiedTransactions, Bill, Source, Child])],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    SharedService,
    ExpensesService,
    UsersService,
    AuthService,
  ],
})
export class ExcelModule {}