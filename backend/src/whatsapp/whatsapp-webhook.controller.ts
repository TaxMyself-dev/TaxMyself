import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSignatureService } from './whatsapp-signature.service';
import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('webhooks/meta/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly config: WhatsAppConfigService,
    private readonly signatures: WhatsAppSignatureService,
    private readonly parser: WhatsAppWebhookParser,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') suppliedToken?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    this.assertEnabled();
    if (
      mode !== 'subscribe' ||
      !challenge ||
      !this.secureStringEqual(suppliedToken ?? '', this.config.verifyToken())
    ) {
      throw new ForbiddenException('WhatsApp webhook verification failed');
    }
    return challenge;
  }

  @Post()
  @HttpCode(200)
  receive(
    @Req() request: RawBodyRequest,
    @Headers('x-hub-signature-256') signature?: string,
  ): { accepted: true; eventCount: number } {
    this.assertEnabled();
    const rawBody = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('WhatsApp raw body is unavailable');
    }

    this.signatures.assertValid(rawBody, signature);

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid WhatsApp webhook JSON');
    }
    const events = this.parser.parse(payload);
    return { accepted: true, eventCount: events.length };
  }

  private assertEnabled(): void {
    if (!this.config.isEnabled()) throw new NotFoundException();
  }

  private secureStringEqual(actual: string, expected: string): boolean {
    const actualHash = createHash('sha256').update(actual).digest();
    const expectedHash = createHash('sha256').update(expected).digest();
    return timingSafeEqual(actualHash, expectedHash);
  }
}
