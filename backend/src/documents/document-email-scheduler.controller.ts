import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { DocumentEmailSchedulerGuard } from './document-email-scheduler.guard';
import { DocumentEmailQueue } from './document-email-queue.service';

@Controller('internal/document-email')
@UseGuards(DocumentEmailSchedulerGuard)
export class DocumentEmailSchedulerController {
  constructor(private readonly queue: DocumentEmailQueue) {}
  @Post('round')
  @HttpCode(200)
  round() {
    return this.queue.round();
  }
}
