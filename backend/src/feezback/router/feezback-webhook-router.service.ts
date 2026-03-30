import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import axios from 'axios';

@Injectable()
export class FeezbackWebhookRouterService {
    private readonly logger = new Logger(FeezbackWebhookRouterService.name);

    async forward(req: Request): Promise<void> {
        const targetUrl = this.resolveTargetUrl();
        if (!targetUrl) return;

        const headers = this.buildForwardHeaders(req);

        // Prefer rawBody if available (useful for signature parity),
        // but fallback to parsed body for normal JSON posting.
        const payload = (req as any).rawBody ?? req.body;

        const eventType = (payload as any)?.event ?? 'unknown';
        const startedAt = Date.now();
        this.logger.log(
            `[WebhookRouter] Forwarding | event=${eventType} | url=${targetUrl}`,
        );

        try {
            const response = await axios.post(targetUrl, payload, {
                headers,
                timeout: Number(process.env.FEEZBACK_WEBHOOK_FORWARD_TIMEOUT_MS ?? 30_000),
                validateStatus: () => true, // don't throw on non-2xx; we will log it
            });

            const elapsed = Date.now() - startedAt;
            if (response.status >= 400) {
                this.logger.error(
                    `[WebhookRouter] Forward failed | status=${response.status} | url=${targetUrl} | event=${eventType} | elapsed=${elapsed}ms`,
                );
            } else {
                this.logger.log(
                    `[WebhookRouter] Forward success | status=${response.status} | url=${targetUrl} | event=${eventType} | elapsed=${elapsed}ms`,
                );
            }
        } catch (err: any) {
            this.logger.error(
                `[WebhookRouter] Forward threw (network error) | url=${targetUrl} | event=${eventType} | elapsed=${Date.now() - startedAt}ms | error=${err?.message}`,
                err?.stack || String(err),
            );
        }
    }

    private resolveTargetUrl(): string | null {
        const prodUrl = process.env.PROD_WEBHOOK_URL?.trim();

        if (!prodUrl) {
            this.logger.error(
                '[WebhookRouter] PROD_WEBHOOK_URL is not configured — cannot forward webhook.',
            );
            return null;
        }

        return prodUrl;
    }

    private buildForwardHeaders(req: Request): Record<string, string> {
        // Clone & sanitize headers: do not forward host / connection / content-length.
        // Keep Feezback signature headers etc.
        const out: Record<string, string> = {};

        for (const [keyRaw, value] of Object.entries(req.headers)) {
            if (!value) continue;

            const key = keyRaw.toLowerCase();

            if (
                key === 'host' ||
                key === 'connection' ||
                key === 'content-length' ||
                key === 'accept-encoding' // optional: let axios handle
            ) {
                continue;
            }

            // Express may give string | string[]
            out[key] = Array.isArray(value) ? value.join(',') : String(value);
        }

        // Ensure content-type exists when using rawBody buffer
        if (!out['content-type']) {
            out['content-type'] = 'application/json';
        }

        // Optional trace header for your own debugging
        out['x-webhook-router'] = 'feezback';

        return out;
    }
}
