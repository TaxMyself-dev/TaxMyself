import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSignatureService } from './whatsapp-signature.service';

describe('WhatsAppSignatureService', () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  const config = new WhatsAppConfigService();
  const service = new WhatsAppSignatureService(config);

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  it('accepts the exact raw bytes signed with the app secret', () => {
    process.env.WHATSAPP_APP_SECRET = 'unit-test-secret';
    const raw = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = createHmac('sha256', 'unit-test-secret')
      .update(raw)
      .digest('hex');
    expect(() => service.assertValid(raw, `sha256=${signature}`)).not.toThrow();
  });

  it.each([undefined, '', 'sha256=nope', `sha256=${'0'.repeat(64)}`])(
    'rejects a missing, malformed, or incorrect signature',
    (signature) => {
      process.env.WHATSAPP_APP_SECRET = 'unit-test-secret';
      expect(() => service.assertValid(Buffer.from('{}'), signature)).toThrow(
        UnauthorizedException,
      );
    },
  );
});
