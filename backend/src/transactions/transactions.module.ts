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

@Module({
  imports: [TypeOrmModule.forFeature([Expense, User, Transactions, Bill, Child])],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    UsersService,
    AuthService,
  ],
})
export class ExcelModule {}