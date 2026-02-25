import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { FeezbackWebhookService } from './feezback-webhook.service';
import { FeezbackWebhookEventBody } from './dto/feezback-webhook.dto';

@Controller('webhooks')
export class FeezbackWebhookController {
  private readonly logger = new Logger(FeezbackWebhookController.name);

  constructor(private readonly webhookService: FeezbackWebhookService) {}

  @Post('feezback')
  async handleWebhook(
    @Body() body: FeezbackWebhookEventBody,
    @Headers('x-feezback-secret') providedSecret?: string,
  ) {
    const expectedSecret = process.env.FEEZBACK_WEBHOOK_SECRET;

    if (expectedSecret && expectedSecret.trim() !== '') {
      if (!providedSecret || providedSecret !== expectedSecret) {
        this.logger.warn('Received Feezback webhook with invalid or missing secret. Ignoring payload.');
        return { success: true, ignored: true };
      }
    }

    try {
      await this.webhookService.handleWebhook(body);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Error handling Feezback webhook: ${error?.message}`, error?.stack);
      return { success: true, error: error?.message };
    }
  }
}
