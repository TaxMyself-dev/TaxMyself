import { Module } from '@nestjs/common';
import { FeezbackWebhookRouterService } from './feezback-webhook-router.service';

@Module({
    providers: [FeezbackWebhookRouterService],
    exports: [FeezbackWebhookRouterService],
})
export class FeezbackWebhookRouterModule { }
