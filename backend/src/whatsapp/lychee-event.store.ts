import { Injectable, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import type { LycheeEvent } from './lychee-webhook.controller';
import { lycheeSender } from './lychee-sender';

export interface LycheeJob {
  event_id: string;
  payload: LycheeEvent;
  lease_token: string;
  attempts: number;
}

/** Explicit SQL only: this table is NOT registered for TypeORM synchronize. */
@Injectable()
export class LycheeEventStore {
  constructor(private readonly db: DataSource) {}

  async enqueue(event: LycheeEvent): Promise<'SAVED' | 'DUPLICATE'> {
    const payload = JSON.stringify(event);
    const hash = createHash('sha256').update(payload).digest('hex');
    try {
      await this.db.query(
        `INSERT INTO lychee_intake_events
        (event_id, channel_id, message_id, sender_phone, payload, payload_hash, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          event.event_id,
          event.channel_id,
          event.message_id,
          lycheeSender(event),
          payload,
          hash,
        ],
      );
      return 'SAVED';
    } catch (e: any) {
      if (e?.code !== 'ER_DUP_ENTRY') throw e;
      const rows = await this.db.query(
        'SELECT payload_hash FROM lychee_intake_events WHERE event_id = ?',
        [event.event_id],
      );
      if (rows[0]?.payload_hash !== hash)
        throw new ConflictException('Event identifier reused');
      return 'DUPLICATE';
    }
  }

  async claim(): Promise<LycheeJob | null> {
    await this.db.query(`UPDATE lychee_intake_events SET status='FAILED',
      last_error='LEASE_EXPIRED', lease_token=NULL, lease_until=NULL
      WHERE status='PROCESSING' AND lease_until < UTC_TIMESTAMP() AND attempts >= 5`);
    const token = randomUUID();
    await this.db.query(
      `UPDATE lychee_intake_events SET status='PROCESSING',
      lease_token=?, lease_until=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), attempts=attempts+1
      WHERE (status IN ('PENDING','RETRY') AND next_attempt_at <= UTC_TIMESTAMP())
        OR (status='PROCESSING' AND lease_until < UTC_TIMESTAMP())
      ORDER BY created_at LIMIT 1`,
      [token],
    );
    const rows = await this.db.query(
      'SELECT event_id, payload, lease_token, attempts FROM lychee_intake_events WHERE lease_token=?',
      [token],
    );
    if (!rows.length) return null;
    return {
      ...rows[0],
      payload:
        typeof rows[0].payload === 'string'
          ? JSON.parse(rows[0].payload)
          : rows[0].payload,
    };
  }

  async complete(
    job: LycheeJob,
    status: string,
    owner: string | null = null,
    business: string | null = null,
    drive: string | null = null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE lychee_intake_events SET status=?, firebase_id=?, business_number=?,
      drive_file_id=?, content=NULL, lease_token=NULL, lease_until=NULL
      WHERE event_id=? AND lease_token=?`,
      [status, owner, business, drive, job.event_id, job.lease_token],
    );
  }

  async waitForBusiness(
    job: LycheeJob,
    owner: string,
    choices: unknown[],
    file: { content: Buffer; filename: string; mimeType: string },
  ): Promise<void> {
    await this.db.query(
      `UPDATE lychee_intake_events SET status='WAITING_FOR_BUSINESS', firebase_id=?,
      business_choices=?, content=?, filename=?, mime_type=?, lease_token=NULL, lease_until=NULL
      WHERE event_id=? AND lease_token=?`,
      [
        owner,
        JSON.stringify(choices),
        file.content,
        file.filename,
        file.mimeType,
        job.event_id,
        job.lease_token,
      ],
    );
  }

  async retry(job: LycheeJob): Promise<void> {
    await this.db.query(
      `UPDATE lychee_intake_events SET status=?, last_error='INTAKE_FAILED',
      next_attempt_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 60 SECOND), lease_token=NULL, lease_until=NULL
      WHERE event_id=? AND lease_token=?`,
      [job.attempts >= 5 ? 'FAILED' : 'RETRY', job.event_id, job.lease_token],
    );
  }

  async prepared(job: LycheeJob): Promise<any> {
    const rows = await this.db.query(
      `SELECT firebase_id, business_number, content, filename, mime_type
      FROM lychee_intake_events WHERE event_id=? AND lease_token=?`,
      [job.event_id, job.lease_token],
    );
    return rows[0];
  }

  async selectBusiness(event: LycheeEvent, owner: string): Promise<boolean> {
    if (!event.reply_to_whatsapp_message_id) return false;
    const rows = await this.db.query(
      `SELECT event_id, business_choices FROM lychee_intake_events
      WHERE channel_id=? AND sender_phone=? AND firebase_id=? AND status='WAITING_FOR_BUSINESS'
      AND prompt_whatsapp_message_id=? LIMIT 2`,
      [
        event.channel_id,
        lycheeSender(event),
        owner,
        event.reply_to_whatsapp_message_id,
      ],
    );
    if (rows.length !== 1) return false;
    const choices =
      typeof rows[0].business_choices === 'string'
        ? JSON.parse(rows[0].business_choices)
        : rows[0].business_choices;
    const choice = choices.filter((c: any) => c.label === event.text.trim());
    if (choice.length !== 1) return false;
    const result = await this.db.query(
      `UPDATE lychee_intake_events SET business_number=?, status='PENDING',
      attempts=0, next_attempt_at=UTC_TIMESTAMP() WHERE event_id=? AND status='WAITING_FOR_BUSINESS'`,
      [choice[0].businessNumber, rows[0].event_id],
    );
    return result.affectedRows === 1;
  }

  /** Read-only lookup: completed prompts retain ownership for late/repeated replies. */
  async ownsReply(event: LycheeEvent): Promise<boolean> {
    if (!event.reply_to_whatsapp_message_id) return false;
    const rows = await this.db.query(
      `SELECT event_id FROM lychee_intake_events WHERE channel_id=? AND sender_phone=?
       AND prompt_whatsapp_message_id=? LIMIT 2`,
      [event.channel_id, lycheeSender(event), event.reply_to_whatsapp_message_id],
    );
    if (rows.length > 1) throw new ConflictException('Ambiguous prompt ownership');
    return rows.length === 1;
  }

  /** Future send adapter calls ONLY after obtaining the actual WhatsApp prompt ID. */
  async recordPrompt(eventId: string, channelId: string, owner: string, promptId: string): Promise<void> {
    if (typeof promptId !== 'string' || !promptId.length || promptId.length > 255) {
      throw new ConflictException('Invalid prompt identifier');
    }
    await this.db.query(
      `UPDATE lychee_intake_events SET prompt_whatsapp_message_id=?
       WHERE event_id=? AND channel_id=? AND firebase_id=? AND status='WAITING_FOR_BUSINESS'
       AND (prompt_whatsapp_message_id IS NULL OR prompt_whatsapp_message_id=?)`,
      [promptId, eventId, channelId, owner, promptId],
    );
    const rows = await this.db.query(
      `SELECT prompt_whatsapp_message_id FROM lychee_intake_events
       WHERE event_id=? AND channel_id=? AND firebase_id=?`, [eventId, channelId, owner],
    );
    if (rows.length !== 1 || rows[0].prompt_whatsapp_message_id !== promptId) {
      throw new ConflictException('Prompt mapping not recorded');
    }
  }
}
