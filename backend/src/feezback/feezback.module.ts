import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeezbackController } from './feezback.controller';
import { FeezbackService } from './feezback.service';
import { FeezbackJwtService } from './feezback-jwt.service';
import { Delegation } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';
import { Transactions } from '../transactions/transactions.entity';
import { UsersModule } from '../users/users.module';
import { UsersService } from 'src/users/users.service';
import { SharedService } from 'src/shared/shared.service';
import { Business } from 'src/business/business.entity';
import { Child } from 'src/users/child.entity';
import { Expense } from 'src/expenses/expenses.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';

@Module({
  imports: [
    HttpModule.register({
      timeout: 90000, // 90 seconds timeout for all requests
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([Delegation, User, Child, Transactions, Expense, Business, SettingDocuments]),
    UsersModule,
  ],
  controllers: [FeezbackController],
  providers: [FeezbackService, FeezbackJwtService, UsersService, SharedService],
  exports: [FeezbackService],
})
export class FeezbackModule {}


// import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm'
// import { FinsiteService } from './feezback.service';
// import { FinsiteController } from './feezback.controller';
// import { Finsite } from './feezback.entity';


// @Module({
//   imports: [TypeOrmModule.forFeature([Finsite])],
//   controllers: [FinsiteController],
//   providers: [
//     FinsiteService
//   ],
// })
// export class FinsiteModule {}