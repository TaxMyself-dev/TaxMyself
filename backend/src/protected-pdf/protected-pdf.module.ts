import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../business/business.entity';
import { ImportedDocument } from '../document-import/entities/imported-document.entity';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { PdfInspectionService } from './pdf-inspection.service';
import { ProtectedPdfStore } from './protected-pdf.store';
import { ProtectedPdfService } from './protected-pdf.service';
import { ProtectedPdfWorker } from './protected-pdf.worker';
@Module({
  imports: [
    TypeOrmModule.forFeature([Business, ImportedDocument, ExtractedDocument]),
    GoogleDriveModule,
  ],
  providers: [
    PdfInspectionService,
    ProtectedPdfStore,
    ProtectedPdfService,
    ProtectedPdfWorker,
  ],
  exports: [PdfInspectionService, ProtectedPdfService],
})
export class ProtectedPdfModule {}
