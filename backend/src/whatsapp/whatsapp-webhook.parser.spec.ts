import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';

const textFixture = require('./fixtures/text-message.json');
const imageFixture = require('./fixtures/image-message.json');
const pdfFixture = require('./fixtures/pdf-message.json');
const statusesFixture = require('./fixtures/statuses.json');

describe('WhatsAppWebhookParser', () => {
  const parser = new WhatsAppWebhookParser();

  it('maps a text message without retaining the provider envelope', () => {
    expect(parser.parse(textFixture)).toEqual([
      {
        kind: 'message.text',
        metaMessageId: 'wamid.text-test',
        fromWaId: '15551112222',
        contactName: 'Test Customer',
        text: 'How do I upload a document?',
        phoneNumberId: 'phone-number-test',
        timestamp: '1789000000',
      },
    ]);
  });

  it('maps image media metadata', () => {
    expect(parser.parse(imageFixture)).toEqual([
      expect.objectContaining({
        kind: 'message.image',
        metaMessageId: 'wamid.image-test',
        mediaId: 'media-image-test',
        mimeType: 'image/jpeg',
        caption: 'Test receipt',
      }),
    ]);
  });

  it('maps PDF documents and rejects other document MIME types', () => {
    expect(parser.parse(pdfFixture)).toEqual([
      expect.objectContaining({
        kind: 'message.pdf',
        metaMessageId: 'wamid.pdf-test',
        mediaId: 'media-pdf-test',
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
      }),
    ]);

    const unsupported = structuredClone(pdfFixture);
    unsupported.entry[0].changes[0].value.messages[0].document.mime_type =
      'application/zip';
    expect(parser.parse(unsupported)).toEqual([
      expect.objectContaining({
        kind: 'unsupported',
        reason: 'unsupported_document_type',
        metaMessageId: 'wamid.pdf-test',
      }),
    ]);
  });

  it('maps delivery and failure statuses with reduced error data', () => {
    expect(parser.parse(statusesFixture)).toEqual([
      expect.objectContaining({
        kind: 'status',
        metaMessageId: 'wamid.outbound-test',
        status: 'delivered',
        conversationId: 'conversation-test',
        errorCodes: [],
      }),
      expect.objectContaining({
        kind: 'status',
        metaMessageId: 'wamid.failed-test',
        status: 'failed',
        errorCodes: [131000],
      }),
    ]);
  });

  it('returns a bounded unsupported DTO for unknown payloads', () => {
    expect(
      parser.parse({ object: 'other', secret: 'must-not-be-copied' }),
    ).toEqual([
      {
        kind: 'unsupported',
        reason: 'unexpected_object',
        metaMessageId: null,
        phoneNumberId: null,
        timestamp: null,
      },
    ]);
  });

  it('handles mixed entries without discarding supported events', () => {
    const mixed = structuredClone(textFixture);
    mixed.entry[0].changes.push({
      field: 'account_update',
      value: { sensitive: 'not-copied' },
    });
    expect(parser.parse(mixed)).toEqual([
      expect.objectContaining({
        kind: 'message.text',
        metaMessageId: 'wamid.text-test',
      }),
      {
        kind: 'unsupported',
        reason: 'unsupported_change',
        metaMessageId: null,
        phoneNumberId: null,
        timestamp: null,
      },
    ]);
  });
});
