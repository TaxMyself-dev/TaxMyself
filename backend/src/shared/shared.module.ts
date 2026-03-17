import { Module } from '@nestjs/common';
import { SharedService } from './shared.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expenses/expenses.entity';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: registered here to satisfy SharedService injection. Remove import and Transactions from forFeature when SharedService no longer injects transactionRepository.
import { Transactions } from '../transactions/transactions.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Transactions, SettingDocuments])],
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

