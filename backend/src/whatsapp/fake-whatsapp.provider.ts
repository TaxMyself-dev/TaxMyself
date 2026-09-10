import { Injectable } from '@nestjs/common';
import {
  WhatsAppProvider,
  WhatsAppProviderMedia,
  WhatsAppProviderMessageReceipt,
  WhatsAppTemplateRequest,
} from './whatsapp.types';

@Injectable()
export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly kind = 'fake' as const;
  readonly sentTemplates: WhatsAppTemplateRequest[] = [];
  readonly media = new Map<string, WhatsAppProviderMedia>();

  async sendTemplate(
    request: WhatsAppTemplateRequest,
  ): Promise<WhatsAppProviderMessageReceipt> {
    this.sentTemplates.push({
      ...request,
      parameters: request.parameters ? [...request.parameters] : undefined,
    });
    return {
      providerMessageId: `fake-${this.sentTemplates.length}`,
    };
  }

  async downloadMedia(mediaId: string): Promise<WhatsAppProviderMedia> {
    const value = this.media.get(mediaId);
    if (!value) throw new Error('Fake WhatsApp media was not registered');
    return {
      content: Buffer.from(value.content),
      mimeType: value.mimeType,
    };
  }
}
