import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { FakeWhatsAppProvider } from './fake-whatsapp.provider';
import { WhatsAppSignatureService } from './whatsapp-signature.service';
import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';
import { WhatsAppWebhookEvent } from './whatsapp.types';

export type WhatsAppSandboxInboundKind = 'text' | 'image' | 'pdf';
export type WhatsAppSandboxDeliveryOutcome = 'success' | 'failed';

export interface WhatsAppSandboxInboundRequest {
  kind: WhatsAppSandboxInboundKind;
  text?: string;
  caption?: string;
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
}

export interface WhatsAppSandboxInboundResult {
  accepted: true;
  signatureVerified: true;
  event: WhatsAppWebhookEvent;
  media: null | {
    downloaded: true;
    fileName: string;
    mimeType: string;
    size: number;
    sha256: string;
  };
  steps: string[];
}

@Injectable()
export class WhatsAppSandboxService {
  private static readonly MAX_MEDIA_BYTES = 2 * 1024 * 1024;

  constructor(
    private readonly parser: WhatsAppWebhookParser,
    private readonly signatures: WhatsAppSignatureService,
    private readonly fakeProvider: FakeWhatsAppProvider,
  ) {}

  async simulateInbound(
    request: WhatsAppSandboxInboundRequest,
  ): Promise<WhatsAppSandboxInboundResult> {
    const messageId = `sandbox-in-${randomUUID()}`;
    const mediaId = `sandbox-media-${randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = this.buildMessage(request, messageId, mediaId, timestamp);
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'sandbox-waba',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550000000',
                  phone_number_id: 'sandbox-phone-number',
                },
                contacts: [
                  { profile: { name: 'לקוח בדיקה' }, wa_id: '972501234567' },
                ],
                messages: [message],
              },
            },
          ],
        },
      ],
    };

    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const ephemeralSecret = randomBytes(32).toString('hex');
    const signature = `sha256=${createHmac('sha256', ephemeralSecret)
      .update(rawBody)
      .digest('hex')}`;
    this.signatures.assertValidWithSecret(rawBody, signature, ephemeralSecret);

    const event = this.parser.parse(JSON.parse(rawBody.toString('utf8')))[0];
    let media: WhatsAppSandboxInboundResult['media'] = null;
    if (request.kind !== 'text') {
      const content = this.decodeMedia(request.contentBase64);
      const mimeType = this.assertMimeType(request.kind, request.mimeType);
      this.fakeProvider.media.set(mediaId, { content, mimeType });
      try {
        const downloaded = await this.fakeProvider.downloadMedia(mediaId);
        media = {
          downloaded: true,
          fileName: this.safeFileName(request.fileName, request.kind),
          mimeType: downloaded.mimeType,
          size: downloaded.content.length,
          sha256: createHash('sha256').update(downloaded.content).digest('hex'),
        };
      } finally {
        this.fakeProvider.media.delete(mediaId);
      }
    }

    return {
      accepted: true,
      signatureVerified: true,
      event,
      media,
      steps: [
        'webhook_created',
        'signature_verified',
        'payload_parsed',
        ...(media ? ['media_downloaded_in_memory'] : []),
      ],
    };
  }

  async simulateTemplate(outcome: WhatsAppSandboxDeliveryOutcome) {
    const receipt = await this.fakeProvider.sendTemplate({
      to: '972501234567',
      templateName: 'document_request_vat_he',
      languageCode: 'he',
      parameters: ['לקוח בדיקה', 'יולי–אוגוסט'],
    });
    const statuses =
      outcome === 'failed'
        ? [
            { status: 'sent', errorCode: null },
            { status: 'failed', errorCode: 131026 },
          ]
        : [
            { status: 'sent', errorCode: null },
            { status: 'delivered', errorCode: null },
            { status: 'read', errorCode: null },
          ];
    return {
      accepted: true,
      providerMessageId: receipt.providerMessageId,
      templateName: 'document_request_vat_he',
      preview: 'שלום לקוח בדיקה, חסרים מסמכים לדוח המע״מ של יולי–אוגוסט.',
      statuses,
    };
  }

  private buildMessage(
    request: WhatsAppSandboxInboundRequest,
    messageId: string,
    mediaId: string,
    timestamp: string,
  ): Record<string, unknown> {
    const base = {
      from: '972501234567',
      id: messageId,
      timestamp,
    };
    if (request.kind === 'text') {
      const text = request.text?.trim();
      if (!text) throw new BadRequestException('Sandbox text is required');
      return { ...base, type: 'text', text: { body: text } };
    }

    const content = this.decodeMedia(request.contentBase64);
    const mimeType = this.assertMimeType(request.kind, request.mimeType);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (request.kind === 'image') {
      return {
        ...base,
        type: 'image',
        image: {
          id: mediaId,
          mime_type: mimeType,
          sha256,
          caption: request.caption?.trim() || undefined,
        },
      };
    }
    return {
      ...base,
      type: 'document',
      document: {
        id: mediaId,
        mime_type: mimeType,
        sha256,
        caption: request.caption?.trim() || undefined,
        filename: this.safeFileName(request.fileName, request.kind),
      },
    };
  }

  private decodeMedia(value?: string): Buffer {
    if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      throw new BadRequestException('Sandbox media is invalid');
    }
    const content = Buffer.from(value, 'base64');
    if (
      content.length === 0 ||
      content.length > WhatsAppSandboxService.MAX_MEDIA_BYTES
    ) {
      throw new BadRequestException('Sandbox media must be 2 MB or smaller');
    }
    return content;
  }

  private assertMimeType(
    kind: Exclude<WhatsAppSandboxInboundKind, 'text'>,
    mimeType?: string,
  ): string {
    const allowed =
      kind === 'pdf' ? ['application/pdf'] : ['image/jpeg', 'image/png'];
    if (!mimeType || !allowed.includes(mimeType)) {
      throw new BadRequestException('Sandbox media type is not supported');
    }
    return mimeType;
  }

  private safeFileName(
    value: string | undefined,
    kind: Exclude<WhatsAppSandboxInboundKind, 'text'>,
  ): string {
    const fallback = kind === 'pdf' ? 'document.pdf' : 'image.jpg';
    return (value || fallback).replace(/[\\/\0]/g, '_').slice(0, 120);
  }
}
