import {
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DocumentAiWorker } from './document-ai.worker';
import { DocumentSchedulerGuard } from './document-ai-scheduler.guard';

@Controller('internal/document-ai')
@UseGuards(DocumentSchedulerGuard)
export class DocumentSchedulerController {
  constructor(private readonly worker: DocumentAiWorker) {}
  @Post('round')
  @HttpCode(200)
  async round(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.execute(request, response, (signal) =>
      this.worker.round(signal),
    );
  }
  @Post('maintenance')
  @HttpCode(200)
  async maintenance(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.execute(request, response, (signal) =>
      this.worker.maintenance(signal),
    );
  }
  private async execute(
    request: Request,
    response: Response,
    work: (signal: AbortSignal) => Promise<unknown>,
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    // Response close signals a disconnected client; request.close also fires on normal body completion.
    request.once('aborted', abort);
    response.once('close', abort);
    if (request.aborted || response.destroyed) abort();
    const timer = setTimeout(abort, 120000);
    try {
      return await work(controller.signal);
    } finally {
      clearTimeout(timer);
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  }
}
