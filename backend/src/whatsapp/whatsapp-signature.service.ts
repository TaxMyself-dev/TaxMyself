import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { WhatsAppConfigService } from './whatsapp-config.service';

@Injectable()
export class WhatsAppSignatureService {
  constructor(private readonly config: WhatsAppConfigService) {}

  assertValid(rawBody: Buffer, signatureHeader?: string): void {
    this.assertValidWithSecret(
      rawBody,
      signatureHeader,
      this.config.appSecret(),
    );
  }

  assertValidWithSecret(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    secret: string,
  ): void {
    const supplied = String(signatureHeader ?? '')
      .trim()
      .toLowerCase();
    if (!/^sha256=[a-f0-9]{64}$/.test(supplied)) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const actual = Buffer.from(supplied.slice('sha256='.length), 'hex');
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }
  }
}
