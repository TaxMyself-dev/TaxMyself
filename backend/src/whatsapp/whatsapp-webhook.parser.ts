import { Injectable } from '@nestjs/common';
import {
  WhatsAppDeliveryStatus,
  WhatsAppUnsupportedEvent,
  WhatsAppWebhookEvent,
} from './whatsapp.types';

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class WhatsAppWebhookParser {
  private readonly knownStatuses = new Set<WhatsAppDeliveryStatus>([
    'sent',
    'delivered',
    'read',
    'failed',
    'deleted',
  ]);

  parse(payload: unknown): WhatsAppWebhookEvent[] {
    const root = this.record(payload);
    if (!root || root.object !== 'whatsapp_business_account') {
      return [this.unsupported('unexpected_object')];
    }

    const events: WhatsAppWebhookEvent[] = [];
    for (const entryValue of this.array(root.entry)) {
      const entry = this.record(entryValue);
      for (const changeValue of this.array(entry?.changes)) {
        const change = this.record(changeValue);
        const value = this.record(change?.value);
        if (change?.field !== 'messages' || !value) {
          events.push(this.unsupported('unsupported_change'));
          continue;
        }
        const phoneNumberId = this.string(
          this.record(value.metadata)?.phone_number_id,
        );
        const contacts = new Map<string, string | null>();
        for (const contactValue of this.array(value.contacts)) {
          const contact = this.record(contactValue);
          const waId = this.string(contact?.wa_id);
          if (waId) {
            contacts.set(
              waId,
              this.string(this.record(contact?.profile)?.name),
            );
          }
        }

        for (const messageValue of this.array(value.messages)) {
          events.push(this.parseMessage(messageValue, phoneNumberId, contacts));
        }
        for (const statusValue of this.array(value.statuses)) {
          events.push(this.parseStatus(statusValue, phoneNumberId));
        }
      }
    }
    return events.length > 0 ? events : [this.unsupported('empty_payload')];
  }

  private parseMessage(
    input: unknown,
    phoneNumberId: string | null,
    contacts: Map<string, string | null>,
  ): WhatsAppWebhookEvent {
    const message = this.record(input);
    const metaMessageId = this.string(message?.id);
    const fromWaId = this.string(message?.from);
    const timestamp = this.string(message?.timestamp);
    if (!message || !metaMessageId || !fromWaId) {
      return this.unsupported('malformed_message', phoneNumberId, timestamp);
    }
    const contactName = contacts.get(fromWaId) ?? null;

    if (message.type === 'text') {
      const text = this.string(this.record(message.text)?.body);
      return text === null
        ? this.unsupported(
            'malformed_text',
            phoneNumberId,
            timestamp,
            metaMessageId,
          )
        : {
            kind: 'message.text',
            metaMessageId,
            fromWaId,
            contactName,
            text,
            phoneNumberId,
            timestamp,
          };
    }

    if (message.type === 'image') {
      const image = this.record(message.image);
      const mediaId = this.string(image?.id);
      return mediaId === null
        ? this.unsupported(
            'malformed_image',
            phoneNumberId,
            timestamp,
            metaMessageId,
          )
        : {
            kind: 'message.image',
            metaMessageId,
            fromWaId,
            contactName,
            mediaId,
            mimeType: this.string(image?.mime_type),
            sha256: this.string(image?.sha256),
            caption: this.string(image?.caption),
            phoneNumberId,
            timestamp,
          };
    }

    if (message.type === 'document') {
      const document = this.record(message.document);
      const mediaId = this.string(document?.id);
      const mimeType = this.string(document?.mime_type);
      if (!mediaId || mimeType !== 'application/pdf') {
        return this.unsupported(
          mimeType ? 'unsupported_document_type' : 'malformed_document',
          phoneNumberId,
          timestamp,
          metaMessageId,
        );
      }
      return {
        kind: 'message.pdf',
        metaMessageId,
        fromWaId,
        contactName,
        mediaId,
        mimeType,
        sha256: this.string(document?.sha256),
        caption: this.string(document?.caption),
        filename: this.string(document?.filename),
        phoneNumberId,
        timestamp,
      };
    }

    return this.unsupported(
      `unsupported_message_type:${this.string(message.type) ?? 'unknown'}`,
      phoneNumberId,
      timestamp,
      metaMessageId,
    );
  }

  private parseStatus(
    input: unknown,
    phoneNumberId: string | null,
  ): WhatsAppWebhookEvent {
    const status = this.record(input);
    const metaMessageId = this.string(status?.id);
    const recipientWaId = this.string(status?.recipient_id);
    const statusName = this.string(
      status?.status,
    ) as WhatsAppDeliveryStatus | null;
    const timestamp = this.string(status?.timestamp);
    if (
      !status ||
      !metaMessageId ||
      !recipientWaId ||
      !statusName ||
      !this.knownStatuses.has(statusName)
    ) {
      return this.unsupported(
        'unsupported_status',
        phoneNumberId,
        timestamp,
        metaMessageId,
      );
    }

    const errorCodes = this.array(status.errors)
      .map((error) => Number(this.record(error)?.code))
      .filter((code) => Number.isFinite(code));
    return {
      kind: 'status',
      metaMessageId,
      recipientWaId,
      status: statusName,
      conversationId: this.string(this.record(status.conversation)?.id),
      errorCodes,
      phoneNumberId,
      timestamp,
    };
  }

  private unsupported(
    reason: string,
    phoneNumberId: string | null = null,
    timestamp: string | null = null,
    metaMessageId: string | null = null,
  ): WhatsAppUnsupportedEvent {
    return {
      kind: 'unsupported',
      reason,
      metaMessageId,
      phoneNumberId,
      timestamp,
    };
  }

  private record(value: unknown): UnknownRecord | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as UnknownRecord)
      : null;
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }
}
