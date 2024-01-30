import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { AuthService } from 'src/users/auth.service';
import { Expense } from './expenses.entity';
import { User } from 'src/users/user.entity';
import { DefaultCategory } from './categories.entity';
import { UsersService } from 'src/users/users.service';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, User, DefaultCategory])],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    UsersService,
    AuthService,
  ],
})
export class ExpensesModule {}
