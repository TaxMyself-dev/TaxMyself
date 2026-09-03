import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { MailgunSignatureService } from './mailgun-signature.service';

describe('MailgunSignatureService', () => {
  const originalEnv = process.env;
  const signingKey = 'test-signing-key';
  let service: MailgunSignatureService;

  beforeEach(() => {
    process.env = { ...originalEnv, MAILGUN_INBOUND_SIGNING_KEY: signingKey };
    service = new MailgunSignatureService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts a current valid Mailgun signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = 'a'.repeat(50);
    const signature = createHmac('sha256', signingKey)
      .update(`${timestamp}${token}`)
      .digest('hex');

    expect(() =>
      service.assertValid({ timestamp, token, signature }),
    ).not.toThrow();
  });

  it('rejects an invalid signature', () => {
    expect(() =>
      service.assertValid({
        timestamp: String(Math.floor(Date.now() / 1000)),
        token: 'a'.repeat(50),
        signature: '0'.repeat(64),
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a stale timestamp', () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const token = 'a'.repeat(50);
    const signature = createHmac('sha256', signingKey)
      .update(`${timestamp}${token}`)
      .digest('hex');

    expect(() => service.assertValid({ timestamp, token, signature })).toThrow(
      'Stale Mailgun webhook timestamp',
    );
  });
});
