import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import type { LycheeEvent } from './lychee-webhook.controller';
import { lycheeSender } from './lychee-sender';
import { normalizeWhatsappPhone } from './whatsapp-development.config';

export function lycheeRoutingCommand(event: LycheeEvent): 'dev' | 'prod' | null {
  if (event.has_media || event.message_type !== 'text' || event.reply_to_whatsapp_message_id) return null;
  const text = event.text.trim().replace(/\s+/g, ' ');
  return text === 'בדיקות' ? 'dev' : text === 'סיום בדיקות' ? 'prod' : null;
}

/** Routing journal only: these terminal rows never enter the document worker. */
@Injectable()
export class LycheeTestRoutingService {
  constructor(private readonly db: DataSource) {}

  async resolve(event: LycheeEvent): Promise<{ environment: 'dev' | 'prod'; command: boolean }> {
    const sender = lycheeSender(event);
    const configured = (process.env.LYCHEE_TEST_PHONES || '').split(',').map(x => x.trim()).filter(Boolean);
    const allowed = configured.map(normalizeWhatsappPhone);
    if (!allowed.length || allowed.some(x => !x)) throw new ServiceUnavailableException('Test senders not configured');
    if (!sender || !allowed.includes(sender)) throw new ForbiddenException();
    const timestamp = typeof event.occurred_at === 'string' && event.occurred_at.length <= 64
      ? Date.parse(event.occurred_at) : NaN;
    if (!Number.isFinite(timestamp)) throw new BadRequestException('Event timestamp required');
    const occurredAt = new Date(timestamp).toISOString();
    const command = lycheeRoutingCommand(event);
    // Separate namespace from actual intake IDs. The original signed event remains unchanged.
    const key = 'route:' + createHash('sha256').update(JSON.stringify([event.channel_id, event.event_id])).digest('hex');
    const hash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const lock = createHash('sha256').update(JSON.stringify([this.db.options.database, event.channel_id, sender])).digest('hex');
    const runner = this.db.createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      const rows = await runner.query('SELECT GET_LOCK(?, 5) AS acquired', [lock]);
      locked = Number(rows[0]?.acquired) === 1;
      if (!locked) throw new ServiceUnavailableException('Routing state busy');
      const existing = await runner.query('SELECT payload_hash, status FROM lychee_intake_events WHERE event_id=?', [key]);
      if (existing.length) {
        if (existing[0].payload_hash !== hash) throw new ConflictException('Event identifier reused');
        const status = existing[0].status;
        if (!['ROUTE_DEV', 'ROUTE_PROD', 'ROUTE_COMMAND_DEV', 'ROUTE_COMMAND_PROD'].includes(status)) {
          throw new ConflictException('Invalid routing journal entry');
        }
        return { environment: status.endsWith('_DEV') ? 'dev' : 'prod', command: status.startsWith('ROUTE_COMMAND_') };
      }
      let environment: 'dev' | 'prod' = command || 'prod';
      if (!command) {
        // Timestamp order prevents a delayed older command from undoing a newer one.
        const previous = await runner.query(`SELECT DISTINCT status,
          JSON_UNQUOTE(JSON_EXTRACT(payload, '$.occurred_at')) AS occurred_at
          FROM lychee_intake_events WHERE channel_id=? AND sender_phone=?
          AND status IN ('ROUTE_COMMAND_DEV','ROUTE_COMMAND_PROD')
          AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.occurred_at')) <= ?
          ORDER BY occurred_at DESC, status DESC LIMIT 2`, [event.channel_id, sender, occurredAt]);
        if (previous.length > 1 && previous[0].occurred_at === previous[1].occurred_at && previous[0].status !== previous[1].status) {
          throw new ConflictException('Ambiguous routing command order');
        }
        if (previous.length) environment = previous[0].status === 'ROUTE_COMMAND_DEV' ? 'dev' : 'prod';
      }
      await runner.query(`INSERT INTO lychee_intake_events
        (event_id, channel_id, message_id, sender_phone, payload, payload_hash, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [key, event.channel_id, event.message_id, sender,
        JSON.stringify({ ...event, occurred_at: occurredAt }), hash,
        (command ? 'ROUTE_COMMAND_' : 'ROUTE_') + environment.toUpperCase()]);
      return { environment, command: !!command };
    } finally {
      try { if (locked) await runner.query('SELECT RELEASE_LOCK(?)', [lock]); }
      finally { await runner.release(); }
    }
  }
}
