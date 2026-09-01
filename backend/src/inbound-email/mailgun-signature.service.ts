import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface MailgunSignatureFields {
  timestamp?: string;
  token?: string;
  signature?: string;
}

/**
 * Verifies the signature Mailgun includes in inbound route HTTP requests.
 *
 * This intentionally has no replay cache during the spike: Mailgun retries a
 * failed request with the same signed payload. The durable event ledger in the
 * production slice will own replay/idempotency protection.
 */
@Injectable()
export class MailgunSignatureService {
  private static readonly DEFAULT_MAX_AGE_SECONDS = 15 * 60;

  assertValid(fields: MailgunSignatureFields): void {
    const signingKey = process.env.MAILGUN_INBOUND_SIGNING_KEY?.trim();
    if (!signingKey) {
      throw new UnauthorizedException('Mailgun signing key is not configured');
    }

    const timestamp = String(fields.timestamp ?? '').trim();
    const token = String(fields.token ?? '').trim();
    const signature = String(fields.signature ?? '')
      .trim()
      .toLowerCase();
    if (!timestamp || !token || !/^[a-f0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('Invalid Mailgun signature fields');
    }

    const timestampSeconds = Number(timestamp);
    const maxAgeSeconds = this.maxAgeSeconds();
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > maxAgeSeconds
    ) {
      throw new UnauthorizedException('Stale Mailgun webhook timestamp');
    }

    const expected = createHmac('sha256', signingKey)
      .update(`${timestamp}${token}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const suppliedBuffer = Buffer.from(signature, 'hex');
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid Mailgun signature');
    }
  }

  private maxAgeSeconds(): number {
    const configured = Number(
      process.env.MAILGUN_INBOUND_SIGNATURE_MAX_AGE_SECONDS,
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : MailgunSignatureService.DEFAULT_MAX_AGE_SECONDS;
  }
}
