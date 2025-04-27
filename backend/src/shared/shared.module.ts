import { Module } from '@nestjs/common';
import { SharedService } from './shared.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expenses/expenses.entity';
import { Transactions } from '../transactions/transactions.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Transactions, SettingDocuments])],
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

