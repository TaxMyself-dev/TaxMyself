import { Module } from '@nestjs/common';
import { DocumentsModule } from 'src/documents/documents.module';
import { DocumentOcrQueueService } from './document-ocr-queue.service';
import { DocumentOcrWorkerController } from './document-ocr-worker.controller';

@Module({
  imports: [DocumentsModule],
  controllers: [DocumentOcrWorkerController],
  providers: [DocumentOcrQueueService],
  exports: [DocumentOcrQueueService],
})
export class DocumentProcessingModule {}
