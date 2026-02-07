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
import { UsersModule } from '../users/users.module';
import { Child } from '../users/child.entity';
import { DefaultCategory } from './default-categories.entity';
import { UserCategory } from './user-categories.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense, User, Business, DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory, Supplier, Child, Delegation ]),
    SharedModule,
    UsersModule
  ],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    AuthService,
  ],
})
export class ExpensesModule {}
