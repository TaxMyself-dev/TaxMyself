import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeezbackController } from './feezback.controller';
import { FeezbackService } from './feezback.service';
import { FeezbackJwtService } from './feezback-jwt.service';
import { FeezbackAuthService } from './core/feezback-auth.service';
import { FeezbackHttpClient } from './core/feezback-http.client';
import { FeezbackApiService } from './api/feezback-api.service';
import { FeezbackConsentApiService } from './consent/feezback-consent-api.service';
import { Delegation } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';
import { UserModuleSubscription } from '../users/user-module-subscription.entity';
import { Source } from '../transactions/source.entity';
import { UsersModule } from '../users/users.module';
import { SharedService } from 'src/shared/shared.service';
import { Business } from 'src/business/business.entity';
import { Child } from 'src/users/child.entity';
import { Expense } from 'src/expenses/expenses.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { FeezbackWebhookRouterModule } from './router/feezback-webhook-router.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 90000, // 90 seconds timeout for all requests
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([Delegation, User, UserModuleSubscription, Child, Expense, Business, SettingDocuments, Source]),
    forwardRef(() => UsersModule),
    FeezbackWebhookRouterModule,
    forwardRef(() => TransactionsModule),
  ],
  controllers: [FeezbackController],
  providers: [
    FeezbackService,
    FeezbackJwtService,
    FeezbackAuthService,
    FeezbackHttpClient,
    FeezbackApiService,
    FeezbackConsentApiService,
    SharedService,
  ],
  exports: [FeezbackService, FeezbackApiService],
})
export class FeezbackModule { }


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