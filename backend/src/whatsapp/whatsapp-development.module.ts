import { Module } from '@nestjs/common';
import { DocumentImportModule } from '../document-import/document-import.module';
import { DocumentImportService } from '../document-import/document-import.service';
import { WhatsappDevelopmentConfig } from './whatsapp-development.config';
import { WhatsappDevelopmentController } from './whatsapp-development.controller';
import { WhatsappDevelopmentGuard } from './whatsapp-development.guard';
import { WhatsappRoutingService } from './whatsapp-routing.service';
import {
  WhatsappDocumentService,
  WHATSAPP_DOCUMENT_IMPORTER,
} from './whatsapp-document.service';

@Module({
  imports: [DocumentImportModule],
  controllers: [WhatsappDevelopmentController],
  providers: [
    WhatsappDevelopmentConfig,
    WhatsappDevelopmentGuard,
    WhatsappRoutingService,
    WhatsappDocumentService,
    { provide: WHATSAPP_DOCUMENT_IMPORTER, useExisting: DocumentImportService },
  ],
})
export class WhatsappDevelopmentModule {}
