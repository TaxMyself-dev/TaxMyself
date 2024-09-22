//General
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
//Entities
import { Expense } from './expenses.entity';
import { User } from '../users/user.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { Supplier } from './suppliers.entity';
import { UserSubCategory } from './user-sub-categories.entity';
//Controllers
import { ExpensesController } from './expenses.controller';
//Services
import { ExpensesService } from './expenses.service';
import { AuthService } from '../users/auth.service';
import { UsersService } from '../users/users.service';
import { Child } from '../users/child.entity';
import { Category } from './categories.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, User, Category, DefaultSubCategory, UserSubCategory, Supplier, Child ]),
            SharedModule],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    UsersService,
    AuthService,
  ],
})
export class ExpensesModule {}
