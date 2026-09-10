import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { WhatsAppConfigService } from './whatsapp-config.service';
import {
  WhatsAppProvider,
  WhatsAppProviderMedia,
  WhatsAppProviderMessageReceipt,
  WhatsAppTemplateRequest,
} from './whatsapp.types';

/**
 * Stage-1 Meta transport boundary. It validates configuration when selected,
 * but cannot make network calls until the explicitly approved Meta spike.
 */
@Injectable()
export class MetaWhatsAppClient implements WhatsAppProvider {
  readonly kind = 'meta' as const;

  constructor(private readonly config: WhatsAppConfigService) {}

  assertConfigured(): void {
    this.config.assertMetaTransportConfigured();
  }

  async sendTemplate(
    _request: WhatsAppTemplateRequest,
  ): Promise<WhatsAppProviderMessageReceipt> {
    throw this.offlineOnly();
  }

  async downloadMedia(_mediaId: string): Promise<WhatsAppProviderMedia> {
    throw this.offlineOnly();
  }

  private offlineOnly(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Meta WhatsApp transport is disabled until the approved live spike',
    );
  }
}
