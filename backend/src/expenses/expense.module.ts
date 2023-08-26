import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { Expense } from './expenses.entity';
import { Supplier } from './supplier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Supplier])],
  controllers: [ExpensesController],
  providers: [ExpensesService]
})
export class ExpensesModule {}
