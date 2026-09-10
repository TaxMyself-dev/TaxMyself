export type WhatsAppProviderKind = 'fake' | 'meta';

export interface WhatsAppTemplateRequest {
  to: string;
  templateName: string;
  languageCode: string;
  parameters?: string[];
}

export interface WhatsAppProviderMessageReceipt {
  providerMessageId: string;
}

export interface WhatsAppProviderMedia {
  content: Buffer;
  mimeType: string;
}

/**
 * Transport boundary for WhatsApp-specific I/O. Stage 1 only permits the fake
 * implementation; the Meta implementation deliberately refuses live calls.
 */
export interface WhatsAppProvider {
  readonly kind: WhatsAppProviderKind;
  sendTemplate(
    request: WhatsAppTemplateRequest,
  ): Promise<WhatsAppProviderMessageReceipt>;
  downloadMedia(mediaId: string): Promise<WhatsAppProviderMedia>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface WhatsAppBaseWebhookEvent {
  phoneNumberId: string | null;
  timestamp: string | null;
}

export interface WhatsAppTextMessageEvent extends WhatsAppBaseWebhookEvent {
  kind: 'message.text';
  metaMessageId: string;
  fromWaId: string;
  contactName: string | null;
  text: string;
}

export interface WhatsAppImageMessageEvent extends WhatsAppBaseWebhookEvent {
  kind: 'message.image';
  metaMessageId: string;
  fromWaId: string;
  contactName: string | null;
  mediaId: string;
  mimeType: string | null;
  sha256: string | null;
  caption: string | null;
}

export interface WhatsAppPdfMessageEvent extends WhatsAppBaseWebhookEvent {
  kind: 'message.pdf';
  metaMessageId: string;
  fromWaId: string;
  contactName: string | null;
  mediaId: string;
  mimeType: 'application/pdf';
  sha256: string | null;
  caption: string | null;
  filename: string | null;
}

export type WhatsAppDeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'deleted';

export interface WhatsAppStatusEvent extends WhatsAppBaseWebhookEvent {
  kind: 'status';
  metaMessageId: string;
  recipientWaId: string;
  status: WhatsAppDeliveryStatus;
  conversationId: string | null;
  errorCodes: number[];
}

export interface WhatsAppUnsupportedEvent extends WhatsAppBaseWebhookEvent {
  kind: 'unsupported';
  reason: string;
  metaMessageId: string | null;
}

export type WhatsAppWebhookEvent =
  | WhatsAppTextMessageEvent
  | WhatsAppImageMessageEvent
  | WhatsAppPdfMessageEvent
  | WhatsAppStatusEvent
  | WhatsAppUnsupportedEvent;
