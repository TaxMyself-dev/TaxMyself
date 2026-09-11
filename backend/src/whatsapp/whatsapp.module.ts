import { Module } from '@nestjs/common';
import { FakeWhatsAppProvider } from './fake-whatsapp.provider';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSignatureService } from './whatsapp-signature.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';
import { WhatsAppSandboxController } from './whatsapp-sandbox.controller';
import { WhatsAppSandboxService } from './whatsapp-sandbox.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp.types';

@Module({
  controllers: [WhatsAppWebhookController, WhatsAppSandboxController],
  providers: [
    WhatsAppConfigService,
    WhatsAppSignatureService,
    WhatsAppWebhookParser,
    WhatsAppSandboxService,
    FakeWhatsAppProvider,
    MetaWhatsAppClient,
    {
      provide: WHATSAPP_PROVIDER,
      inject: [WhatsAppConfigService, FakeWhatsAppProvider, MetaWhatsAppClient],
      useFactory: (
        config: WhatsAppConfigService,
        fake: FakeWhatsAppProvider,
        meta: MetaWhatsAppClient,
      ): WhatsAppProvider => {
        if (!config.isEnabled() || config.providerKind() === 'fake')
          return fake;
        meta.assertConfigured();
        return meta;
      },
    },
  ],
  exports: [WHATSAPP_PROVIDER, WhatsAppConfigService],
})
export class WhatsAppModule {}
