import { buildBusinessQuestion } from './lychee-business-question';
import type { LycheeEvent } from './lychee-webhook.controller';

const event = {
  channel_id: 'channel',
  whatsapp_message_id: 'wamid.document',
} as LycheeEvent;
describe('Business question preview; no external sends', () => {
  it('quotes each document and presents distinct human-readable business buttons', () => {
    const result = buildBusinessQuestion(event, '972501234567', [
      { businessNumber: '123', businessName: 'נגרות' },
      { businessNumber: '456', businessName: 'ייעוץ' },
    ]);
    expect(result.preview).toEqual({
      channel_id: 'channel',
      phone: '972501234567',
      text: 'לאיזה עסק לשייך את המסמך?',
      buttons: [{ text: '1. נגרות' }, { text: '2. ייעוץ' }],
      reply_to_whatsapp_message_id: 'wamid.document',
    });
    expect(result.choices[1]).toEqual({
      businessNumber: '456',
      name: 'ייעוץ',
      label: '2. ייעוץ',
    });
    expect(result.preview.buttons?.map((button) => button.text)).toEqual(
      result.choices.map((choice) => choice.label),
    );
    expect(
      result.preview.buttons?.every(
        (button) => Object.keys(button).join() === 'text',
      ),
    ).toBe(true);
    expect(
      buildBusinessQuestion(
        { ...event, whatsapp_message_id: 'wamid.second' },
        '972501234567',
        [{ businessNumber: '123' }, { businessNumber: '456' }],
      ).preview.reply_to_whatsapp_message_id,
    ).toBe('wamid.second');
  });
  it('keeps duplicate/long names distinguishable and uses short button labels', () => {
    const choices = buildBusinessQuestion(event, '972501234567', [
      { businessNumber: '123', businessName: 'שם עסק ארוך מאוד'.repeat(4) },
      { businessNumber: '456', businessName: 'שם עסק ארוך מאוד'.repeat(4) },
    ]).choices;
    expect(choices[0].label).not.toBe(choices[1].label);
    expect(choices.every((c) => c.label.length <= 20)).toBe(true);
  });
  it('uses a quoted numeric menu for more than three businesses', () => {
    const result = buildBusinessQuestion(
      event,
      '972501234567',
      ['1', '2', '3', '4'].map((businessNumber) => ({ businessNumber })),
    );
    expect(result.preview.buttons).toBeUndefined();
    expect(result.choices.map((c) => c.label)).toEqual(['1', '2', '3', '4']);
    expect(result.preview.text).toContain('4. 4');
  });
  it('refuses invalid or duplicated businesses and never assigns a synthetic prompt ID', () => {
    expect(() =>
      buildBusinessQuestion(event, '972501234567', [
        { businessNumber: '123' },
        { businessNumber: '123' },
      ]),
    ).toThrow();
    const result = buildBusinessQuestion(event, '972501234567', [
      { businessNumber: '123' },
      { businessNumber: '456' },
    ]);
    expect(result).not.toHaveProperty('prompt_whatsapp_message_id');
  });
});
