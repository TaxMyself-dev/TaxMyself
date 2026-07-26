import { Module } from '@nestjs/common';
import { SharedService } from './shared.service';
import { FxRateService } from './fx-rate.service';
import { FxRate } from './fx-rate.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expenses/expenses.entity';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: registered here to satisfy SharedService injection. Remove import and Transactions from forFeature when SharedService no longer injects transactionRepository.
import { Transactions } from '../transactions/transactions.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { Delegation } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Transactions, SettingDocuments, FxRate, Delegation, User])],
  providers: [SharedService, FxRateService],
  exports: [SharedService, FxRateService],
})
export class SharedModule {}

