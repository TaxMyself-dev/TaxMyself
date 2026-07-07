import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Business — the Drive inbox/ folder ids live on the business row
import { Business } from 'src/business/business.entity';

import { GoogleDriveModule } from 'src/google-drive/google-drive.module';
import { ImportedDocument } from './entities/imported-document.entity';
import { DocumentImportService } from './document-import.service';

/**
 * The shared document-intake pipeline. Every import channel (Gmail import,
 * manual upload, camera, future API/email-forwarding) depends on this module
 * and funnels files through DocumentImportService into the business's Drive
 * inbox — the single entry point for the existing Claude analysis flow.
 *
 * No controller here on purpose: sources own their endpoints, this module
 * owns what happens after a file candidate exists.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ImportedDocument, Business]),
    // Reuses the existing service-account Drive client for inbox uploads
    GoogleDriveModule,
  ],
  providers: [DocumentImportService],
  exports: [DocumentImportService],
})
export class DocumentImportModule {}
