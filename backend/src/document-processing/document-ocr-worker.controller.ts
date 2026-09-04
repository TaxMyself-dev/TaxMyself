import {
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import { DocumentsService } from 'src/documents/documents.service';
import {
  DocumentOcrQueueService,
  DocumentOcrTaskPayload,
} from './document-ocr-queue.service';

@Controller('internal/tasks')
export class DocumentOcrWorkerController {
  private readonly logger = new Logger(DocumentOcrWorkerController.name);

  constructor(
    private readonly queueService: DocumentOcrQueueService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('document-ocr')
  async process(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: DocumentOcrTaskPayload,
  ): Promise<{ ok: true; processed: number; total: number }> {
    await this.queueService.assertAuthorized(authorization);
    const firebaseId = body?.firebaseId?.trim();
    const businessNumber = body?.businessNumber?.trim();
    if (!firebaseId || !businessNumber) {
      throw new InternalServerErrorException('Invalid document OCR task payload');
    }

    const result = await this.documentsService.processInboxForUser(
      firebaseId,
      businessNumber,
    );
    if (result.failed > 0) {
      this.logger.warn(
        `OCR task has ${result.failed} failed file(s) for business=${businessNumber}; requesting retry`,
      );
      throw new InternalServerErrorException('Document OCR task has failed files');
    }

    return { ok: true, processed: result.processed, total: result.total };
  }
}
