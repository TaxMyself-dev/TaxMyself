import type { LycheeEvent } from './lychee-webhook.controller';
import { lycheeSender } from './lychee-sender';

export interface SelectionSnapshot {
  documentEventId: string;
  documentWhatsappMessageId: string;
  questionId: string;
  businessNumber: string;
  name: string;
}
const parse = (value: any) =>
  typeof value === 'string' ? JSON.parse(value) : value;
const selectedStates = [
  'PENDING',
  'PROCESSING',
  'RETRY',
  'IMPORTED',
  'ALREADY_IMPORTED',
  'FAILED',
  'BLOCKED_IMPORT',
];

/** A quoted, valid button choice for an owned document whose first choice already won. */
export function selectedBusinessSnapshot(
  source: any,
  reply: LycheeEvent,
  owner: string,
): SelectionSnapshot | null {
  if (
    !source ||
    reply.has_media ||
    !reply.reply_to_whatsapp_message_id ||
    source.channel_id !== reply.channel_id ||
    source.firebase_id !== owner ||
    !lycheeSender(reply) ||
    source.sender_phone !== lycheeSender(reply) ||
    source.prompt_whatsapp_message_id !== reply.reply_to_whatsapp_message_id ||
    !source.business_number ||
    !selectedStates.includes(source.status)
  )
    return null;
  const choices = parse(source.business_choices);
  const original = parse(source.payload);
  if (
    !Array.isArray(choices) ||
    !original?.has_media ||
    original.event_id !== source.event_id ||
    original.channel_id !== source.channel_id ||
    lycheeSender(original) !== source.sender_phone ||
    typeof original.whatsapp_message_id !== 'string' ||
    !original.whatsapp_message_id.trim()
  )
    return null;
  const selected = choices.filter(
    (c) => c.businessNumber === source.business_number,
  );
  if (
    selected.length !== 1 ||
    choices.filter((c) => c.label === reply.text.trim()).length !== 1
  )
    return null;
  return {
    documentEventId: source.event_id,
    documentWhatsappMessageId: original.whatsapp_message_id,
    questionId: source.prompt_whatsapp_message_id,
    businessNumber: source.business_number,
    name:
      typeof selected[0].name === 'string' && selected[0].name.trim()
        ? selected[0].name.replace(/\s+/g, ' ').trim().slice(0, 160)
        : source.business_number,
  };
}

export function reminderSnapshot(row: any): SelectionSnapshot | null {
  const choices = parse(row.business_choices);
  if (!Array.isArray(choices) || choices.length !== 1) return null;
  const snapshot = choices[0];
  return snapshot &&
    [
      'documentEventId',
      'documentWhatsappMessageId',
      'questionId',
      'businessNumber',
      'name',
    ].every((key) => typeof snapshot[key] === 'string' && snapshot[key].trim())
    ? snapshot
    : null;
}

export function sameSelectionSnapshot(
  a: SelectionSnapshot,
  b: SelectionSnapshot,
): boolean {
  return [
    'documentEventId',
    'documentWhatsappMessageId',
    'questionId',
    'businessNumber',
    'name',
  ].every((key) => a[key] === b[key]);
}
