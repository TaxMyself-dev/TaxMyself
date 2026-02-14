import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeezbackController } from './feezback.controller';
import { FeezbackService } from './feezback.service';
import { FeezbackJwtService } from './feezback-jwt.service';
import { FeezbackAuthService } from './core/feezback-auth.service';
import { FeezbackHttpClient } from './core/feezback-http.client';
import { FeezbackApiService } from './api/feezback-api.service';
import { FeezbackConsentApiService } from './consent/feezback-consent-api.service';
import { ConsentSyncService } from './consent/consent-sync.service';
import { ConsentMapper } from './consent/mapper/consent.mapper';
import { Delegation } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';
import { Transactions } from '../transactions/transactions.entity';
import { UsersModule } from '../users/users.module';
import { SharedService } from 'src/shared/shared.service';
import { Business } from 'src/business/business.entity';
import { Child } from 'src/users/child.entity';
import { Expense } from 'src/expenses/expenses.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { FeezbackPersistenceModule } from './consent/feezback-persistence.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 90000, // 90 seconds timeout for all requests
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([Delegation, User, Child, Transactions, Expense, Business, SettingDocuments]),
    UsersModule,
    FeezbackPersistenceModule,
  ],
  controllers: [FeezbackController],
  providers: [
    FeezbackService,
    FeezbackJwtService,
    FeezbackAuthService,
    FeezbackHttpClient,
    FeezbackApiService,
    FeezbackConsentApiService,
    ConsentSyncService,
    ConsentMapper,
    SharedService,
  ],
  exports: [FeezbackService, ConsentSyncService],
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