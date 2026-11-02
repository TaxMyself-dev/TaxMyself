import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WhatsappDevelopmentGuard } from './whatsapp-development.guard';
import { WhatsappRoutingService } from './whatsapp-routing.service';
import {
  SimulatedDocumentMessage,
  WhatsappDocumentService,
} from './whatsapp-document.service';

@Controller('dev/whatsapp')
@UseGuards(WhatsappDevelopmentGuard)
export class WhatsappDevelopmentController {
  constructor(
    private readonly routing: WhatsappRoutingService,
    private readonly documents: WhatsappDocumentService,
  ) {}

  @Get('health')
  health() {
    return { status: 'READY', mode: 'DEVELOPMENT', metaConnected: false };
  }

  @Post('resolve')
  @HttpCode(200)
  resolve(@Body() body: { from?: unknown; businessNumber?: unknown }) {
    return this.routing.resolve(body?.from, body?.businessNumber);
  }

  @Post('documents')
  @HttpCode(200)
  receiveDocument(@Body() body: SimulatedDocumentMessage) {
    return this.documents.receive(body);
  }
}
