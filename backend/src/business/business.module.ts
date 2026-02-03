import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessController } from './business.controller';
import { SharedService } from 'src/shared/shared.service';
import { Business } from './business.entity';
import { BusinessService } from './business.service';
import { Expense } from 'src/expenses/expenses.entity';
import { Transactions } from 'src/transactions/transactions.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { Delegation } from 'src/delegation/delegation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Business, Transactions, Expense, SettingDocuments, Delegation])],
  controllers: [BusinessController],
  providers: [
    BusinessService,
    SharedService,
  ],
  exports: [BusinessService],
})
export class BusinessModule {}