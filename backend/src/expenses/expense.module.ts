//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from 'src/shared/shared.module';
//Entities
import { Expense } from './expenses.entity';
import { User } from 'src/users/user.entity';
import { DefaultCategory } from './categories.entity';
import { Supplier } from './suppliers.entity';
//Controllers
import { ExpensesController } from './expenses.controller';
//Services
import { ExpensesService } from './expenses.service';
import { AuthService } from 'src/users/auth.service';
import { UsersService } from 'src/users/users.service';


@Module({
  imports: [TypeOrmModule.forFeature([Expense, User, DefaultCategory, Supplier ]),
            SharedModule],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    UsersService,
    AuthService,
  ],
})
export class ExpensesModule {}
