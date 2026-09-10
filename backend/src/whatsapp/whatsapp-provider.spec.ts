import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FakeWhatsAppProvider } from './fake-whatsapp.provider';
import { WhatsAppModule } from './whatsapp.module';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp.types';

describe('WhatsApp provider selection', () => {
  const names = [
    'WHATSAPP_ENABLED',
    'WHATSAPP_PROVIDER',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_GRAPH_API_VERSION',
    'WHATSAPP_WABA_ID',
    'WHATSAPP_PHONE_NUMBER_ID',
  ] as const;
  const original = new Map(names.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of names) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('defaults to the fake provider while disabled', async () => {
    delete process.env.WHATSAPP_ENABLED;
    process.env.WHATSAPP_PROVIDER = 'meta';
    const module = await Test.createTestingModule({
      imports: [WhatsAppModule],
    }).compile();
    expect(module.get<WhatsAppProvider>(WHATSAPP_PROVIDER).kind).toBe('fake');
  });

  it('keeps fake sends deterministic and local', async () => {
    const provider = new FakeWhatsAppProvider();
    await expect(
      provider.sendTemplate({
        to: '+15551112222',
        templateName: 'test_template',
        languageCode: 'en_US',
      }),
    ).resolves.toEqual({ providerMessageId: 'fake-1' });
    expect(provider.sentTemplates).toHaveLength(1);
  });

  it('fails closed when enabled Meta configuration is incomplete', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'meta';
    for (const name of names.slice(2)) delete process.env[name];
    await expect(
      Test.createTestingModule({ imports: [WhatsAppModule] }).compile(),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed for an unknown enabled provider', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'typo';
    await expect(
      Test.createTestingModule({ imports: [WhatsAppModule] }).compile(),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
