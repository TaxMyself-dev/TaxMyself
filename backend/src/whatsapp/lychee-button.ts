import type { LycheeEvent } from './lychee-webhook.controller';

/** Old buttons echo their label as button_id. Only custom IDs select by identity. */
export function customButtonId(event: LycheeEvent): string | undefined {
  return event?.button_id && event.button_id !== event.text
    ? event.button_id
    : undefined;
}

export function buttonPredicate(event: LycheeEvent): {
  sql: string;
  value: string;
} {
  const id = customButtonId(event);
  return id
    ? {
        sql: "JSON_CONTAINS(business_choices, ?, '$')",
        value: JSON.stringify({ id }),
      }
    : {
        sql: 'prompt_whatsapp_message_id=?',
        value: event.reply_to_whatsapp_message_id,
      };
}
