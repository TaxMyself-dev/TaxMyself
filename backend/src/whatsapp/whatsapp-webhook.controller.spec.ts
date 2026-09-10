import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSignatureService } from './whatsapp-signature.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';

describe('WhatsAppWebhookController', () => {
  const config = {
    isEnabled: jest.fn(),
    verifyToken: jest.fn(),
  } as unknown as WhatsAppConfigService;
  const signatures = {
    assertValid: jest.fn(),
  } as unknown as WhatsAppSignatureService;
  const parser = { parse: jest.fn() } as unknown as WhatsAppWebhookParser;
  const controller = new WhatsAppWebhookController(config, signatures, parser);

  beforeEach(() => {
    jest.resetAllMocks();
    (config.isEnabled as jest.Mock).mockReturnValue(true);
    (config.verifyToken as jest.Mock).mockReturnValue('verify-test');
    (signatures.assertValid as jest.Mock).mockImplementation(() => undefined);
    (parser.parse as jest.Mock).mockReturnValue([]);
  });

  it('returns the challenge only for an enabled, matching subscription', () => {
    expect(controller.verify('subscribe', 'verify-test', 'challenge')).toBe(
      'challenge',
    );
    expect(() => controller.verify('subscribe', 'wrong', 'challenge')).toThrow(
      ForbiddenException,
    );
  });

  it('hides both webhook methods while the feature is disabled', () => {
    (config.isEnabled as jest.Mock).mockReturnValue(false);
    expect(() => controller.verify('subscribe', 'verify-test', 'x')).toThrow(
      NotFoundException,
    );
    expect(() => controller.receive({} as Request, 'sha256=x')).toThrow(
      NotFoundException,
    );
  });

  it('verifies the signature before parsing JSON or calling the parser', () => {
    (signatures.assertValid as jest.Mock).mockImplementation(() => {
      throw new UnauthorizedException();
    });
    const request = {
      rawBody: Buffer.from('{not-json'),
    } as unknown as Request & { rawBody: Buffer };

    expect(() => controller.receive(request, 'sha256=bad')).toThrow(
      UnauthorizedException,
    );
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('rejects missing raw bytes and signed invalid JSON', () => {
    expect(() => controller.receive({} as Request, 'sha256=x')).toThrow(
      BadRequestException,
    );
    expect(() =>
      controller.receive(
        { rawBody: Buffer.from('{') } as unknown as Request & {
          rawBody: Buffer;
        },
        'sha256=x',
      ),
    ).toThrow(BadRequestException);
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('returns only parsed internal events for a signed JSON payload', () => {
    (parser.parse as jest.Mock).mockReturnValue([
      { kind: 'unsupported', reason: 'empty_payload' },
    ]);
    const request = {
      rawBody: Buffer.from('{"object":"whatsapp_business_account"}'),
    } as unknown as Request & { rawBody: Buffer };
    expect(controller.receive(request, 'sha256=test')).toEqual({
      accepted: true,
      eventCount: 1,
    });
    expect(signatures.assertValid).toHaveBeenCalledWith(
      request.rawBody,
      'sha256=test',
    );
  });
});
