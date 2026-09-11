import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FakeWhatsAppProvider } from './fake-whatsapp.provider';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSandboxController } from './whatsapp-sandbox.controller';
import { WhatsAppSandboxService } from './whatsapp-sandbox.service';
import { WhatsAppSignatureService } from './whatsapp-signature.service';
import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';

describe('WhatsAppSandboxService', () => {
  const provider = new FakeWhatsAppProvider();
  const signatures = new WhatsAppSignatureService({} as WhatsAppConfigService);
  const service = new WhatsAppSandboxService(
    new WhatsAppWebhookParser(),
    signatures,
    provider,
  );

  beforeEach(() => {
    provider.media.clear();
    provider.sentTemplates.length = 0;
  });

  it('runs text through signed raw bytes and the real parser', async () => {
    const result = await service.simulateInbound({
      kind: 'text',
      text: 'שלחתי את המסמכים',
    });

    expect(result.signatureVerified).toBe(true);
    expect(result.event).toMatchObject({
      kind: 'message.text',
      fromWaId: '972501234567',
      text: 'שלחתי את המסמכים',
    });
    expect(result.steps).toEqual([
      'webhook_created',
      'signature_verified',
      'payload_parsed',
    ]);
  });

  it('downloads supported media in memory and immediately removes its bytes', async () => {
    const bytes = Buffer.from('%PDF sandbox');
    const result = await service.simulateInbound({
      kind: 'pdf',
      fileName: '../invoice.pdf',
      mimeType: 'application/pdf',
      contentBase64: bytes.toString('base64'),
    });

    expect(result.event.kind).toBe('message.pdf');
    expect(result.media).toMatchObject({
      downloaded: true,
      fileName: '.._invoice.pdf',
      mimeType: 'application/pdf',
      size: bytes.length,
    });
    expect(result.media?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(provider.media.size).toBe(0);
  });

  it('rejects unsupported media instead of parsing or retaining it', async () => {
    await expect(
      service.simulateInbound({
        kind: 'image',
        fileName: 'unsafe.svg',
        mimeType: 'image/svg+xml',
        contentBase64: Buffer.from('<svg/>').toString('base64'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.media.size).toBe(0);
  });

  it('simulates successful and failed delivery status paths', async () => {
    const success = await service.simulateTemplate('success');
    const failed = await service.simulateTemplate('failed');

    expect(success.statuses.map((entry) => entry.status)).toEqual([
      'sent',
      'delivered',
      'read',
    ]);
    expect(failed.statuses).toEqual([
      { status: 'sent', errorCode: null },
      { status: 'failed', errorCode: 131026 },
    ]);
  });
});

describe('WhatsAppSandboxController availability', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFlag = process.env.WHATSAPP_SANDBOX_ENABLED;
  const sandbox = {
    simulateInbound: jest.fn(),
    simulateTemplate: jest.fn(),
  } as unknown as WhatsAppSandboxService;
  const controller = new WhatsAppSandboxController(sandbox);

  afterEach(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFlag === undefined) delete process.env.WHATSAPP_SANDBOX_ENABLED;
    else process.env.WHATSAPP_SANDBOX_ENABLED = previousFlag;
  });

  it('is unavailable in production and when explicitly disabled', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      controller.simulateTemplate({ outcome: 'success' } as never),
    ).toThrow(NotFoundException);

    process.env.NODE_ENV = 'development';
    process.env.WHATSAPP_SANDBOX_ENABLED = 'false';
    expect(() =>
      controller.simulateInbound({ kind: 'text', text: 'x' } as never),
    ).toThrow(NotFoundException);
  });

  it('reports only the bounded local capabilities when explicitly enabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.WHATSAPP_SANDBOX_ENABLED = 'true';

    expect(controller.status()).toEqual({
      available: true,
      provider: 'fake',
      persistence: false,
      externalNetwork: false,
    });
  });
});
