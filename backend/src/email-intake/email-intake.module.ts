import { DocumentRetryService } from './document-retry.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../business/business.entity';
import { ImportedDocument } from '../document-import/entities/imported-document.entity';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { ProtectedPdfModule } from '../protected-pdf/protected-pdf.module';
import { EmailIntakeStore } from './email-intake.store';
import { EmailIntakeStorage } from './email-intake.storage';
import { EmailRoutingService } from './email-routing.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Business, ImportedDocument]),
    GoogleDriveModule,
    ProtectedPdfModule,
  ],
  providers: [DocumentRetryService, EmailIntakeStore, EmailIntakeStorage, EmailRoutingService],
  exports: [DocumentRetryService, EmailIntakeStore, EmailIntakeStorage, EmailRoutingService],
})
export class EmailIntakeModule {}
