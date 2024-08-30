import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuthService } from 'src/users/auth.service';
import { Expense } from 'src/expenses/expenses.entity';
import { User } from 'src/users/user.entity';
import { Transactions } from './transactions.entity';
import { UsersService } from 'src/users/users.service';
import { Child } from 'src/users/child.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { SharedService } from 'src/shared/shared.service';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { ExpensesService } from 'src/expenses/expenses.service';
import { UserSubCategory } from 'src/expenses/user-sub-categories.entity';
//import { UserCategory } from 'src/expenses/user-categories.entity';
import { DefaultSubCategory } from 'src/expenses/default-sub-categories.entity copy';
//import { DefaultCategory } from 'src/expenses/categories.entity';
import { Supplier } from 'src/expenses/suppliers.entity';
import { Category } from 'src/expenses/categories.entity';

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