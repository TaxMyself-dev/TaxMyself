import { createHmac } from 'crypto';
import axios from 'axios';
import { LycheeEventStore } from './lychee-event.store';
import { parseLycheeEvent, LycheeEvent } from './lychee-webhook.controller';
import { questionFromChoices } from './lychee-business-question';
import { LycheeHttpPromptTransport } from './lychee-prompt.transport';
import { selectedBusinessSnapshot } from './lychee-selection-reminder';
jest.mock('axios');

const event: LycheeEvent = {
  event: 'message.received',
  event_id: 'reply',
  channel_id: 'channel',
  message_id: 'message',
  whatsapp_message_id: 'wamid.reply',
  contact_phone: '0501234567',
  has_media: false,
  message_type: 'text',
  text: 'display',
  button_id: 'choice-a',
  reply_to_whatsapp_message_id: null,
};
const choices = [
  { id: 'choice-a', businessNumber: '123', label: '1. first', name: 'first' },
  { id: 'choice-b', businessNumber: '456', label: '2. second', name: 'second' },
];

describe('Precommitted button identities', () => {
  it('verifies and bounds the signed button field without modifying bytes', () => {
    const withoutQuote = { ...event };
    delete withoutQuote.reply_to_whatsapp_message_id;
    const unquotedRaw = Buffer.from(JSON.stringify(withoutQuote));
    const unquotedSignature =
      'sha256=' +
      createHmac('sha256', 'secret').update(unquotedRaw).digest('hex');
    expect(
      parseLycheeEvent(unquotedRaw, unquotedSignature, 'secret', 'channel')
        .button_id,
    ).toBe(event.button_id);
    for (const button_id of [null, '', 'a'.repeat(200), undefined]) {
      const raw = Buffer.from(JSON.stringify({ ...event, button_id }));
      const signature =
        'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
      expect(
        parseLycheeEvent(raw, signature, 'secret', 'channel').button_id,
      ).toBe(button_id);
    }
    for (const button_id of [123, {}, 'a'.repeat(201)]) {
      const raw = Buffer.from(JSON.stringify({ ...event, button_id }));
      const signature =
        'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
      expect(() =>
        parseLycheeEvent(raw, signature, 'secret', 'channel'),
      ).toThrow();
    }
  });

  it('looks up the persisted ID scoped to sender/channel without a WhatsApp receipt', async () => {
    const db: any = {
      query: jest.fn().mockResolvedValue([{ event_id: 'doc' }]),
    };
    expect(await new LycheeEventStore(db).ownsReply(event)).toBe(true);
    expect(db.query.mock.calls[0][0]).toContain('JSON_CONTAINS');
    expect(db.query.mock.calls[0][1]).toEqual([
      'channel',
      '972501234567',
      JSON.stringify({ id: 'choice-a' }),
    ]);
  });

  it('never falls back to a valid quote/label when the custom ID is unknown', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([]) };
    expect(
      await new LycheeEventStore(db).selectBusiness(
        {
          ...event,
          reply_to_whatsapp_message_id: 'valid-old-question',
          text: choices[0].label,
        },
        'owner',
      ),
    ).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1][3]).toBe(
      JSON.stringify({ id: 'choice-a' }),
    );
  });

  it('retains quote matching for old buttons whose ID is their text', async () => {
    const db: any = {
      query: jest.fn().mockResolvedValue([{ event_id: 'doc' }]),
    };
    await new LycheeEventStore(db).ownsReply({
      ...event,
      button_id: event.text,
      reply_to_whatsapp_message_id: 'old-question',
    });
    expect(db.query.mock.calls[0][0]).not.toContain('JSON_CONTAINS');
    expect(db.query.mock.calls[0][1][2]).toBe('old-question');
  });

  it('sends the exact saved IDs for buttons and lists without mutating drafts', async () => {
    const prior = process.env.LYCHEE_API_KEY;
    process.env.LYCHEE_API_KEY = 'fake-key';
    try {
      for (const count of [2, 4, 10]) {
        const saved = Array.from({ length: count }, (_, i) => ({
          ...choices[0],
          id: `choice-${i}`,
          label: `${i + 1}`,
          businessNumber: `${i}`,
        }));
        const request = questionFromChoices(
          { ...event, whatsapp_message_id: 'wamid.document' },
          '972501234567',
          saved,
        );
        expect(request.buttons.map((b) => b.id)).toEqual(
          saved.map((c) => c.id),
        );
        expect(request.list_button).toBe(count > 3 ? 'בחירת עסק' : undefined);
        const before = JSON.stringify(request);
        (axios.post as jest.Mock).mockResolvedValue({
          status: 200,
          data: { ok: true, waId: 'wamid.test' },
        });
        await new LycheeHttpPromptTransport().send(request, 'test-operation');
        expect((axios.post as jest.Mock).mock.calls.slice(-1)[0][1]).toEqual(
          request,
        );
        expect(JSON.stringify(request)).toBe(before);
      }
    } finally {
      if (prior === undefined) delete process.env.LYCHEE_API_KEY;
      else process.env.LYCHEE_API_KEY = prior;
    }
  });

  it('keeps repeated choices locked before or after receipt persistence', () => {
    const source = {
      event_id: 'doc',
      channel_id: event.channel_id,
      firebase_id: 'owner',
      sender_phone: '972501234567',
      status: 'IMPORTED',
      business_number: '123',
      business_choices: choices,
      payload: {
        ...event,
        event_id: 'doc',
        has_media: true,
        whatsapp_message_id: 'wamid.document',
      },
    };
    const snapshot = selectedBusinessSnapshot(source, event, 'owner');
    expect(snapshot).toMatchObject({
      questionId: 'choice-a',
      businessNumber: '123',
    });
    expect(
      selectedBusinessSnapshot(
        { ...source, prompt_whatsapp_message_id: 'later-receipt' },
        event,
        'owner',
      ),
    ).toEqual(snapshot);
    expect(
      selectedBusinessSnapshot(
        source,
        { ...event, button_id: 'unknown' },
        'owner',
      ),
    ).toBeNull();
  });
});
