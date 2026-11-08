import type { LycheeEvent } from './lychee-webhook.controller';

export interface BusinessChoice {
  businessNumber: string;
  name: string;
  label: string;
}

export interface BusinessQuestionRequest {
  channel_id: string;
  phone: string;
  text: string;
  buttons?: { text: string }[];
  reply_to_whatsapp_message_id: string;
}

/** Render the saved snapshot, never re-label an already staged question. */
export function questionFromChoices(
  event: LycheeEvent,
  phone: string,
  choices: BusinessChoice[],
): BusinessQuestionRequest {
  if (
    !event.whatsapp_message_id ||
    !phone ||
    !Array.isArray(choices) ||
    choices.length < 2 ||
    choices.some(
      (c) =>
        !c.businessNumber || typeof c.label !== 'string' || !c.label.trim(),
    ) ||
    new Set(choices.map((c) => c.label)).size !== choices.length
  )
    throw new Error('Invalid business question');
  return {
    channel_id: event.channel_id,
    phone,
    text:
      choices.length <= 3
        ? 'לאיזה עסק לשייך את המסמך?'
        : 'לאיזה עסק לשייך את המסמך? השב בציטוט להודעה זו עם המספר המתאים:\n' +
          choices
            .map((c) => `${c.label}. ${c.name || c.businessNumber}`)
            .join('\n'),
    ...(choices.length <= 3
      ? { buttons: choices.map((c) => ({ text: c.label })) }
      : {}),
    reply_to_whatsapp_message_id: event.whatsapp_message_id,
  };
}

/** Vendor request preview only: this module contains no network/send operation. */
export function buildBusinessQuestion(
  event: LycheeEvent,
  phone: string,
  businesses: { businessNumber: string; businessName?: string }[],
) {
  if (
    !event.whatsapp_message_id ||
    !phone ||
    businesses.length < 2 ||
    businesses.some((b) => !b.businessNumber) ||
    new Set(businesses.map((b) => b.businessNumber)).size !== businesses.length
  ) {
    throw new Error('Invalid business question');
  }
  const choices: BusinessChoice[] = businesses.map((b, i) => {
    const name =
      (b.businessName || '').replace(/\s+/g, ' ').trim() || b.businessNumber;
    const prefix = `${i + 1}. `;
    let label = prefix;
    // Preserve whole Unicode code points while respecting the short button label.
    for (const char of name) {
      if (label.length + char.length > 20) break;
      label += char;
    }
    return {
      businessNumber: b.businessNumber,
      name,
      label: businesses.length <= 3 ? label : String(i + 1),
    };
  });
  return { choices, preview: questionFromChoices(event, phone, choices) };
}
