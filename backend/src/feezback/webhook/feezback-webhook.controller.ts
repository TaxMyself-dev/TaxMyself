import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { FeezbackWebhookService } from './feezback-webhook.service';
import { FeezbackWebhookEventBody } from './dto/feezback-webhook.dto';

@Controller('feezback')
export class FeezbackWebhookController {
  private readonly logger = new Logger(FeezbackWebhookController.name);

  constructor(private readonly webhookService: FeezbackWebhookService) {}

  @Post('webhook')
  async handleWebhook(
    // @Body() body: FeezbackWebhookEventBody,
    @Body() body: any,
    @Headers('x-feezback-secret') providedSecret?: string,
  ) {
    const eventType = body?.event ?? 'unknown';
    const payloadTimestamp = body?.timestamp ?? body?.payload?.timestamp ?? null;
    const secretPresent = !!(providedSecret && providedSecret.trim() !== '');

    this.logger.log(
      `[FeezbackWebhook] Received event=${eventType} timestamp=${payloadTimestamp ?? 'none'} secretHeader=${secretPresent ? 'present' : 'missing'}`,
    );

    const expectedSecret = process.env.FEEZBACK_WEBHOOK_SECRET;

    if (expectedSecret && expectedSecret.trim() !== '') {
      if (!providedSecret || providedSecret !== expectedSecret) {
        this.logger.warn(
          `[FeezbackWebhook] Secret validation FAILED — ignoring payload event=${eventType}`,
        );
        return { success: true, ignored: true };
      }
      this.logger.debug(`[FeezbackWebhook] Secret validation passed event=${eventType}`);
    } else {
      this.logger.debug(
        `[FeezbackWebhook] FEEZBACK_WEBHOOK_SECRET not configured — skipping secret validation event=${eventType}`,
      );
    }

    try {
      await this.webhookService.handleWebhook(body);
      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `[FeezbackWebhook] Unhandled error for event=${eventType}: ${error?.message}`,
        error?.stack,
      );
      return { success: true, error: error?.message };
    }
  }
}
