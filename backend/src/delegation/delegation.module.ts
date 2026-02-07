import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { DelegationService } from './delegation.service';
import { DelegationController } from './delegation.controller';
import { Delegation } from './delegation.entity';
import { User } from 'src/users/user.entity';
import { MailService } from 'src/mail/mail.service';
import { UsersModule } from 'src/users/users.module';
import { SharedService } from 'src/shared/shared.service';
import { Child } from 'src/users/child.entity';
import { Expense } from 'src/expenses/expenses.entity';
import { Transactions } from 'src/transactions/transactions.entity';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { Business } from 'src/business/business.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([Delegation, User, Business, Transactions, Expense, Child, SettingDocuments]),
    UsersModule
  ],
  controllers: [DelegationController],
  providers: [
    DelegationService,
    SharedService,
    MailService,
    //FirebaseAuthGuard
  ],
  //exports: [FirebaseAuthGuard],
})
export class DelegationModule {}