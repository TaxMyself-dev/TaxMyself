import { Module } from '@nestjs/common';
import { ProtectedPdfModule } from '../protected-pdf/protected-pdf.module';
import { TypeOrmModule } from '@nestjs/typeorm';

// External entities needed for FirebaseAuthGuard dependencies
import { User } from 'src/users/user.entity';
import { Delegation } from 'src/delegation/delegation.entity';

// Guards
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';

import { DocumentImportModule } from 'src/document-import/document-import.module';
import { UserIntegration } from './entities/user-integration.entity';
import { OauthState } from './entities/oauth-state.entity';
import { IntegrationsController } from './integrations.controller';
import { UserIntegrationsService } from './services/user-integrations.service';
import { OauthStateService } from './services/oauth-state.service';
import { EmailConnectionsService } from './services/email-connections.service';
import { ComposioClientService } from './services/composio-client.service';
import { EmailAttachmentDownloadService } from './services/email-attachment-download.service';
import { EmailProvider } from './providers/email-provider';
import { ComposioGmailProvider } from './providers/composio-gmail.provider';
import { GmailReaderService } from './services/gmail-reader.service';
import { GmailDriveImportService } from './services/gmail-drive-import.service';
import { GmailSyncService } from './services/gmail-sync.service';
import { GmailSyncCronService } from './services/gmail-sync-cron.service';

/**
 * Provider-agnostic integrations infrastructure (Phase A), the Google OAuth
 * connect/disconnect flow (Phase B), the Gmail attachment reader (Phase C)
 * and the thin Gmail intake adapter (Phase D) — the generic import pipeline
 * itself lives in DocumentImportModule.
 */
@Module({
  imports: [
    ProtectedPdfModule,
    TypeOrmModule.forFeature([
      UserIntegration,
      OauthState,
      // External entities required by FirebaseAuthGuard
      User,
      Delegation,
    ]),
    // The shared intake pipeline every import source funnels through
    DocumentImportModule,
  ],
  controllers: [IntegrationsController],
  providers: [FirebaseAuthGuard, UserIntegrationsService, OauthStateService, EmailConnectionsService, ComposioClientService, EmailAttachmentDownloadService, { provide: EmailProvider, useClass: ComposioGmailProvider }, GmailReaderService, GmailDriveImportService, GmailSyncService, GmailSyncCronService],
  exports: [UserIntegrationsService, GmailReaderService, GmailDriveImportService, GmailSyncService],
})
export class IntegrationsModule {}
