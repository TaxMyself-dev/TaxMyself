import { Module } from '@nestjs/common';
import { SharedService } from './shared.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from 'src/expenses/expenses.entity';
import { Transactions } from 'src/transactions/transactions.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Transactions])],
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

