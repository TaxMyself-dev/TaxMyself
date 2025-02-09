import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { DelegationService } from './delegation.service';
import { DelegationController } from './delegation.controller';
import { Delegation } from './delegation.entity';
import { User } from 'src/users/user.entity';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from 'src/users/users.service';
import { SharedService } from 'src/shared/shared.service';
import { Child } from 'src/users/child.entity';
import { Expense } from 'src/expenses/expenses.entity';
import { Transactions } from 'src/transactions/transactions.entity';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';


@Module({
  imports: [TypeOrmModule.forFeature([Delegation, User, Transactions, Expense, Child])],
  controllers: [DelegationController],
  providers: [
    DelegationService,
    UsersService,
    SharedService,
    MailService,
    //FirebaseAuthGuard
  ],
  //exports: [FirebaseAuthGuard],
})
export class DelegationModule {}