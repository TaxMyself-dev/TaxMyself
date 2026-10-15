import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShaamSecureController } from './shaam-secure.controller';
import { ShaamOauthService } from './services/shaam-oauth.service';
import { ShaamInvoicesService } from './services/shaam-invoices.service';
import { Business } from '../business/business.entity';
import { BusinessService } from '../business/business.service';
import { BusinessModule } from '../business/business.module';
import {
  loadUniformFileOauthConfig,
  UNIFORM_FILE_OAUTH_CONFIG,
} from './uniform-file/uniform-file-oauth.config';
import { UniformFileOauthService } from './uniform-file/uniform-file-oauth.service';
import { ShaamConnection } from './entities/shaam-connection.entity';
import { ShaamOauthState } from './entities/shaam-oauth-state.entity';
import { UniformFileSubmission } from './entities/uniform-file-submission.entity';
import { ShaamConnectionService } from './services/shaam-connection.service';
import { ShaamOauthStateService } from './services/shaam-oauth-state.service';
import { User } from '../users/user.entity';
import { Delegation } from '../delegation/delegation.entity';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { Documents } from '../documents/documents.entity';
import { DocumentsModule } from '../documents/documents.module';
import { ShaamDocumentAllocationService } from './services/shaam-document-allocation.service';
import { ReportsModule } from '../reports/reports.module';
import { UniformFileSubmissionService } from './services/uniform-file-submission.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([
      Business,
      ShaamConnection,
      ShaamOauthState,
      UniformFileSubmission,
      User,
      Delegation,
      Documents,
    ]),
    BusinessModule,
    DocumentsModule,
    ReportsModule,
  ],
  controllers: [ShaamSecureController],
  providers: [
    ShaamOauthService,
    ShaamInvoicesService,
    ShaamDocumentAllocationService,
    {
      provide: UNIFORM_FILE_OAUTH_CONFIG,
      useFactory: loadUniformFileOauthConfig,
    },
    UniformFileOauthService,
    ShaamConnectionService,
    ShaamOauthStateService,
    UniformFileSubmissionService,
    FirebaseAuthGuard,
  ],
  exports: [
    ShaamOauthService,
    ShaamInvoicesService,
    UniformFileOauthService,
    ShaamConnectionService,
    ShaamOauthStateService,
    UniformFileSubmissionService,
  ],
})
export class ShaamModule {}


