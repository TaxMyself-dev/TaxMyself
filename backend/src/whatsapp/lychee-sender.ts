import { normalizeWhatsappPhone } from './whatsapp-development.config';

/** Contact is authoritative when the provider omits sender; conflicting IDs fail closed. */
export function lycheeSender(event: { sender_phone?: unknown; contact_phone: unknown }): string | null {
  const contact = normalizeWhatsappPhone(event.contact_phone);
  const missing = event.sender_phone == null ||
    typeof event.sender_phone === 'string' && !event.sender_phone.trim();
  const sender = missing ? contact : normalizeWhatsappPhone(event.sender_phone);
  return sender && contact && sender === contact ? contact : null;
}
