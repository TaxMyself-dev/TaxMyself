import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import axios, { AxiosHeaders } from 'axios';

type WebhookTarget = 'dev' | 'prod';

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

        const startedAt = Date.now();
        this.logger.log(
            `Webhook router: forwarding -> ${targetUrl} | target=${process.env.FEEZBACK_WEBHOOK_TARGET ?? 'missing'}`,
        );

        try {
            // Important: keep timeout sensible so we don't hang on network issues.
            await axios.post(targetUrl, payload, {
                headers,
                timeout: Number(process.env.FEEZBACK_WEBHOOK_FORWARD_TIMEOUT_MS ?? 10_000),
                // If payload is raw Buffer, axios will send it as-is.
                // If payload is object, axios will JSON stringify.
                validateStatus: () => true, // don't throw on non-2xx; we will log it
            });

            this.logger.log(
                `Webhook router: forwarded OK (${Date.now() - startedAt}ms) -> ${targetUrl}`,
            );
        } catch (err: any) {
            this.logger.error(
                `Webhook router: forward FAILED (${Date.now() - startedAt}ms) -> ${targetUrl}`,
                err?.stack || String(err),
            );
        }
    }

    private resolveTargetUrl(): string | null {
        const target = (process.env.FEEZBACK_WEBHOOK_TARGET ?? '').trim().toLowerCase() as WebhookTarget;

        const devUrl = process.env.DEV_WEBHOOK_URL?.trim();
        const prodUrl = process.env.PROD_WEBHOOK_URL?.trim();

        if (target !== 'dev' && target !== 'prod') {
            this.logger.error(
                `Missing/invalid FEEZBACK_WEBHOOK_TARGET. Expected "dev" or "prod", got "${process.env.FEEZBACK_WEBHOOK_TARGET}".`,
            );
            return null;
        }

        if (target === 'dev') {
            if (!devUrl) {
                this.logger.error('FEEZBACK_WEBHOOK_TARGET=dev but DEV_WEBHOOK_URL is missing.');
                return null;
            }
            return devUrl;
        }

        // target === 'prod'
        if (!prodUrl) {
            this.logger.error('FEEZBACK_WEBHOOK_TARGET=prod but PROD_WEBHOOK_URL is missing.');
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
