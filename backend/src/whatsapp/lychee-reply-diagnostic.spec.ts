import { Logger } from '@nestjs/common';
import { LycheeEventStore } from './lychee-event.store';
import type { LycheeEvent } from './lychee-webhook.controller';

describe('Business reply rejection diagnostics — fake SQL only', () => {
  const event = {
    event_id: 'test-reply',
    channel_id: 'test-channel',
    contact_phone: '0501234567',
    sender_phone: null,
    text: 'private-label',
    reply_to_whatsapp_message_id: 'private-question',
  } as LycheeEvent;
  const matching = {
    event_id: 'private-document',
    business_choices: [
      { label: 'private-label', businessNumber: 'private-business' },
    ],
  };
  it.each([
    ['REPLY_QUOTE_MISSING', null, [], undefined],
    ['REPLY_QUESTION_NOT_FOUND', 'private-question', [], undefined],
    [
      'REPLY_QUESTION_AMBIGUOUS',
      'private-question',
      [matching, matching],
      undefined,
    ],
    [
      'REPLY_LABEL_NOT_FOUND',
      'private-question',
      [{ ...matching, business_choices: [] }],
      undefined,
    ],
    [
      'REPLY_LABEL_AMBIGUOUS',
      'private-question',
      [
        {
          ...matching,
          business_choices: [
            ...matching.business_choices,
            ...matching.business_choices,
          ],
        },
      ],
      undefined,
    ],
    [
      'REPLY_DOCUMENT_STATE_CHANGED',
      'private-question',
      [matching],
      { affectedRows: 0 },
    ],
  ])('reports %s without private values', async (code, quote, rows, update) => {
    const db: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce(update),
    };
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      expect(
        await new LycheeEventStore(db).selectBusiness(
          { ...event, reply_to_whatsapp_message_id: quote as string | null },
          'private-owner',
        ),
      ).toBe(false);
      const line = JSON.parse(warn.mock.calls[0][0] as string);
      expect(line).toMatchObject({
        event_id: 'test-reply',
        stage: 'business.reply.match',
        outcome: 'blocked',
        code,
      });
      const output = JSON.stringify(line);
      for (const secret of [
        'private-question',
        'private-label',
        'private-owner',
        'private-business',
        '0501234567',
      ])
        expect(output).not.toContain(secret);
      if (code === 'REPLY_QUOTE_MISSING')
        expect(db.query).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
