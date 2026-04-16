import { Body, Controller, Get, Headers, Logger, Post } from '@nestjs/common';
import { FeezbackWebhookService } from './feezback-webhook.service';

@Controller('feezback')
export class FeezbackWebhookController {
  private readonly logger = new Logger(FeezbackWebhookController.name);

  constructor(private readonly webhookService: FeezbackWebhookService) {}

  @Get('webhook')
  handleWebhookVerification() {
    this.logger.log('[FeezbackWebhook] GET /feezback/webhook — verification request received');
    return { ok: true };
  }

  @Post('webhook')
  handleWebhook(
    // @Body() body: FeezbackWebhookEventBody,
    @Body() body: any,
    @Headers('x-feezback-secret') providedSecret?: string,
  ): { success: boolean; ignored?: boolean } {
    const eventType = body?.event ?? 'unknown';
    const payloadTimestamp = body?.timestamp ?? body?.payload?.timestamp ?? null;
    const secretPresent = !!(providedSecret && providedSecret.trim() !== '');

    this.logger.log(
      `[FeezbackWebhook] Received event=${eventType} timestamp=${payloadTimestamp ?? 'none'} secretHeader=${secretPresent ? 'present' : 'missing'}`,
    );

    // Secret validation is synchronous — must complete before ACK is sent.
    const expectedSecret = process.env.FEEZBACK_WEBHOOK_SECRET;

    if (expectedSecret && expectedSecret.trim() !== '') {
      if (!providedSecret || providedSecret !== expectedSecret) {
        this.logger.warn(
          `[FeezbackWebhook] Secret validation FAILED — ignoring payload event=${eventType}`,
        );
        return { success: true, ignored: true };
      }
    } else {
      // No secret configured — validation skipped (dev/staging environment)
    }

    // ACK immediately — heavy processing runs asynchronously.
    this.logger.log(`[FeezbackWebhook] ACK sent — async processing starting event=${eventType}`);
    this.processAsync(body, eventType);

    return { success: true };
  }

  private processAsync(body: any, eventType: string): void {
    void this.webhookService.handleWebhook(body)
      .then(() => {
        this.logger.log(`[FeezbackWebhook] Async processing completed event=${eventType}`);
      })
      .catch((err: any) => {
        this.logger.error(
          `[FeezbackWebhook] Async processing failed event=${eventType}: ${err?.message}`,
          err?.stack,
        );
      });
  }
}
