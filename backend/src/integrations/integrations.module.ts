import { EmailIntakeModule } from '../email-intake/email-intake.module';
import { EmailIntakeRunsService } from '../email-intake/email-intake-runs.service';
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
import { ComposioOutlookProvider } from './providers/composio-outlook.provider';
import { ConnectedEmailProvider } from './providers/connected-email.provider';
import { ComposioGmailProvider } from './providers/composio-gmail.provider';
import { GmailReaderService } from './services/gmail-reader.service';
import { GmailDriveImportService } from './services/gmail-drive-import.service';
import { GmailSyncService } from './services/gmail-sync.service';
import { GmailSyncCronService } from './services/gmail-sync-cron.service';
import { LinkDownloader } from '../email-intake/links/link-downloader.service';
import { LinkNetwork } from '../email-intake/links/link-network';
import { LinkSelector } from '../email-intake/links/link-selector';
import { LinkManualService } from '../email-intake/links/link-manual.service';
import { LinkManualController } from '../email-intake/links/link-manual.controller';

/**
 * Provider-agnostic integrations infrastructure (Phase A), the Google OAuth
 * connect/disconnect flow (Phase B), the Gmail attachment reader (Phase C)
 * and the thin Gmail intake adapter (Phase D) — the generic import pipeline
 * itself lives in DocumentImportModule.
 */
@Module({
  imports: [
    ProtectedPdfModule,
    EmailIntakeModule,
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
  controllers: [IntegrationsController, LinkManualController],
  providers: [LinkNetwork, LinkSelector, LinkDownloader, LinkManualService, EmailIntakeRunsService, FirebaseAuthGuard, UserIntegrationsService, OauthStateService, EmailConnectionsService, ComposioClientService, EmailAttachmentDownloadService, ComposioGmailProvider, ComposioOutlookProvider, { provide: EmailProvider, useClass: ConnectedEmailProvider }, GmailReaderService, GmailDriveImportService, GmailSyncService, GmailSyncCronService],
  exports: [UserIntegrationsService, GmailReaderService, GmailDriveImportService, GmailSyncService],
})
export class IntegrationsModule {}
