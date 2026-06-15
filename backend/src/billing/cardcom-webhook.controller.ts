import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { CardcomWebhookService } from './services/cardcom-webhook.service';

/**
 * Receives inbound webhooks from CardCom.
 * No authentication guard — CardCom must be able to call this endpoint publicly.
 * All responses to CardCom are HTTP 200. Internal errors are swallowed after
 * logging so CardCom does not enter a retry storm.
 */
@Controller('billing/cardcom')
export class CardcomWebhookController {
  private readonly logger = new Logger(CardcomWebhookController.name);

  constructor(private readonly webhookService: CardcomWebhookService) {}

  /**
   * POST /billing/cardcom/webhook
   *
   * CardCom posts a LowProfileResult JSON body here after every payment attempt.
   * We acknowledge immediately with { ok: true } once the payload is accepted.
   * All heavy processing (verification, DB writes, subscription activation) happens
   * inside CardcomWebhookService.handleWebhook().
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: Record<string, any>) {
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      throw new BadRequestException('Empty or malformed webhook payload');
    }

    try {
      await this.webhookService.handleWebhook(body);
    } catch (err) {
      // Swallow all errors so CardCom never receives a 5xx and retries indefinitely.
      this.logger.error(
        `Unhandled error in webhook handler: ${(err as Error)?.message}`,
        (err as Error)?.stack,
      );
    }

    return { ok: true };
  }
}
