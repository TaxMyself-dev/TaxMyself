import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookkeepingModule } from '../bookkeeping/bookkeeping.module';
import { Expense } from '../expenses/expenses.entity';
import { AssetDepreciationPosting } from './asset-depreciation-posting.entity';
import { DepreciationService } from './depreciation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense, AssetDepreciationPosting]),
    BookkeepingModule,
  ],
  providers: [DepreciationService],
  exports: [DepreciationService],
})
export class DepreciationModule {}
