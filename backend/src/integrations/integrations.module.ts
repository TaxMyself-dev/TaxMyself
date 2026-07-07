import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// External entities needed for FirebaseAuthGuard dependencies
import { User } from 'src/users/user.entity';
import { Delegation } from 'src/delegation/delegation.entity';

// Guards
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';

import { UserIntegration } from './entities/user-integration.entity';
import { OauthState } from './entities/oauth-state.entity';
import { IntegrationsController } from './integrations.controller';
import { UserIntegrationsService } from './services/user-integrations.service';
import { OauthStateService } from './services/oauth-state.service';
import { GoogleOauthService } from './services/google-oauth.service';
import { GmailReaderService } from './services/gmail-reader.service';

/**
 * Provider-agnostic integrations infrastructure (Phase A) plus the Google
 * OAuth connect/disconnect flow (Phase B). Provider-specific import services
 * (Gmail reader, Drive import) arrive in later phases.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserIntegration,
      OauthState,
      // External entities required by FirebaseAuthGuard
      User,
      Delegation,
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [FirebaseAuthGuard, UserIntegrationsService, OauthStateService, GoogleOauthService, GmailReaderService],
  exports: [UserIntegrationsService, GoogleOauthService, GmailReaderService],
})
export class IntegrationsModule {}
