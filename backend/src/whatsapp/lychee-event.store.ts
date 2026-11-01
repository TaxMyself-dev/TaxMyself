import { Injectable, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import type { LycheeEvent } from './lychee-webhook.controller';
import { lycheeSender } from './lychee-sender';
import {
  BusinessChoice,
  questionFromChoices,
} from './lychee-business-question';
import { PromptDraft, promptEventId, promptHash } from './lychee-prompt.store';
import { lycheeLog } from './lychee-log';
import { commitDocumentResults } from './lychee-notification.store';
import { ImportBlockCode } from '../document-import/document-import-blocked.error';

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
    const expired = await this.db
      .query(`SELECT event_id FROM lychee_intake_events
      WHERE status='PROCESSING' AND lease_until < UTC_TIMESTAMP() AND attempts >= 5 LIMIT 25`);
    if (expired.length)
      await commitDocumentResults(this.db, async (sql) => {
        const changed: string[] = [];
        for (const row of expired) {
          const result = await sql.query(
            `UPDATE lychee_intake_events SET status='FAILED',
          last_error='LEASE_EXPIRED',lease_token=NULL,lease_until=NULL
          WHERE event_id=? AND status='PROCESSING' AND lease_until<UTC_TIMESTAMP() AND attempts>=5`,
            [row.event_id],
          );
          if (result.affectedRows === 1) changed.push(row.event_id);
        }
        return changed;
      });
    const token = randomUUID();
    await this.db.query(
      `UPDATE lychee_intake_events SET status='PROCESSING',
      lease_token=?, lease_until=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), attempts=attempts+1
      WHERE (status IN ('PENDING','RETRY') AND next_attempt_at <= UTC_TIMESTAMP())
        OR (status='PROCESSING' AND lease_until < UTC_TIMESTAMP() AND attempts < 5)
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
    const update = async (sql: { query: DataSource['query'] }) =>
      sql.query(
        `UPDATE lychee_intake_events SET status=?, firebase_id=?, business_number=?,
      drive_file_id=?, content=NULL, lease_token=NULL, lease_until=NULL
      WHERE event_id=? AND lease_token=?`,
        [status, owner, business, drive, job.event_id, job.lease_token],
      );
    if (
      job.payload.has_media &&
      ['IMPORTED', 'ALREADY_IMPORTED', 'REJECTED_BUSINESS'].includes(status)
    ) {
      await commitDocumentResults(this.db, async (sql) => {
        const result = await update(sql);
        if (result.affectedRows !== 1)
          throw new ConflictException('Document lease no longer owned');
        return [job.event_id];
      });
    } else await update(this.db);
  }

  async waitForBusiness(
    job: LycheeJob,
    owner: string,
    choices: BusinessChoice[],
    file?: { content: Buffer; filename: string; mimeType: string },
  ): Promise<void> {
    const sender = lycheeSender(job.payload);
    if (!sender) throw new ConflictException('Question sender unavailable');
    const draft: PromptDraft = {
      kind: 'BUSINESS_QUESTION',
      documentEventId: job.event_id,
      choices,
      request: questionFromChoices(job.payload, sender, choices),
    };
    const key = promptEventId(job.payload.channel_id, job.event_id);
    const hash = promptHash(draft);
    const runner = this.db.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      const changed = await runner.query(
        `UPDATE lychee_intake_events SET status='WAITING_FOR_BUSINESS', firebase_id=?,
      business_choices=?, content=?, filename=?, mime_type=?, lease_token=NULL, lease_until=NULL
      WHERE event_id=? AND lease_token=?`,
        [
          owner,
          JSON.stringify(choices),
          file?.content ?? null,
          file?.filename ?? null,
          file?.mimeType ?? null,
          job.event_id,
          job.lease_token,
        ],
      );
      if (changed.affectedRows !== 1)
        throw new ConflictException('Document lease no longer owned');
      await runner.query(
        `INSERT INTO lychee_intake_events
      (event_id,channel_id,message_id,sender_phone,payload,payload_hash,status,firebase_id)
      VALUES (?,?,?,?,?,?,'PROMPT_PENDING',?) ON DUPLICATE KEY UPDATE event_id=event_id`,
        [
          key,
          job.payload.channel_id,
          job.payload.message_id,
          sender,
          JSON.stringify(draft),
          hash,
          owner,
        ],
      );
      const saved = await runner.query(
        'SELECT payload_hash,firebase_id FROM lychee_intake_events WHERE event_id=?',
        [key],
      );
      if (
        saved.length !== 1 ||
        saved[0].payload_hash !== hash ||
        saved[0].firebase_id !== owner
      ) {
        throw new ConflictException(
          'Question draft conflicts with existing outbox',
        );
      }
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async retry(job: LycheeJob): Promise<void> {
    const update = async (sql: { query: DataSource['query'] }) =>
      sql.query(
        `UPDATE lychee_intake_events SET status=?, last_error='INTAKE_FAILED',
      next_attempt_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 60 SECOND), lease_token=NULL, lease_until=NULL
      WHERE event_id=? AND lease_token=?`,
        [job.attempts >= 5 ? 'FAILED' : 'RETRY', job.event_id, job.lease_token],
      );
    if (job.attempts >= 5 && job.payload.has_media) {
      await commitDocumentResults(this.db, async (sql) => {
        const result = await update(sql);
        if (result.affectedRows !== 1)
          throw new ConflictException('Document lease no longer owned');
        return [job.event_id];
      });
    } else await update(this.db);
  }

  /** A typed local blocker is final now, not a fabricated fifth attempt. */
  async block(job: LycheeJob, code: ImportBlockCode): Promise<void> {
    await commitDocumentResults(this.db, async (sql) => {
      const changed = await sql.query(
        `UPDATE lychee_intake_events SET status='BLOCKED_IMPORT',last_error=?,
        lease_token=NULL,lease_until=NULL WHERE event_id=? AND lease_token=?`,
        [code, job.event_id, job.lease_token],
      );
      if (changed.affectedRows !== 1)
        throw new ConflictException('Document lease no longer owned');
      return [job.event_id];
    });
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
    if (!event.reply_to_whatsapp_message_id) {
      lycheeLog(
        event.event_id,
        'business.reply.match',
        'blocked',
        'בתשובה חסר מזהה ציטוט reply_to_whatsapp_message_id; אי אפשר לקשר אותה לשאלת בחירת עסק',
        { code: 'REPLY_QUOTE_MISSING' },
      );
      return false;
    }
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
    if (rows.length !== 1) {
      lycheeLog(
        event.event_id,
        'business.reply.match',
        'blocked',
        rows.length === 0
          ? 'לא נמצאה שאלה ממתינה עם מזהה הציטוט הזה התואמת לשולח, לחשבון ולערוץ'
          : 'מזהה הציטוט תואם ליותר ממסמך ממתין אחד; לא ניתן לבחור מסמך באופן חד משמעי',
        {
          code:
            rows.length === 0
              ? 'REPLY_QUESTION_NOT_FOUND'
              : 'REPLY_QUESTION_AMBIGUOUS',
          count: rows.length,
        },
      );
      return false;
    }
    const choices =
      typeof rows[0].business_choices === 'string'
        ? JSON.parse(rows[0].business_choices)
        : rows[0].business_choices;
    const choice = choices.filter((c: any) => c.label === event.text.trim());
    if (choice.length !== 1) {
      lycheeLog(
        event.event_id,
        'business.reply.match',
        'blocked',
        choice.length === 0
          ? 'השאלה זוהתה, אבל טקסט התשובה אינו תואם בדיוק לאף תווית עסק שנשמרה'
          : 'טקסט התשובה תואם ליותר מאפשרות עסק אחת; הבחירה אינה חד משמעית',
        {
          code:
            choice.length === 0
              ? 'REPLY_LABEL_NOT_FOUND'
              : 'REPLY_LABEL_AMBIGUOUS',
          count: choice.length,
        },
      );
      return false;
    }
    const result = await this.db.query(
      `UPDATE lychee_intake_events SET business_number=?, status='PENDING',
      attempts=0, next_attempt_at=UTC_TIMESTAMP() WHERE event_id=? AND status='WAITING_FOR_BUSINESS'`,
      [choice[0].businessNumber, rows[0].event_id],
    );
    if (result.affectedRows !== 1) {
      lycheeLog(
        event.event_id,
        'business.reply.match',
        'blocked',
        'הבחירה התאימה, אבל מצב המסמך השתנה לפני שמירתה; לא עודכן מסמך ממתין',
        { code: 'REPLY_DOCUMENT_STATE_CHANGED' },
      );
      return false;
    }
    return true;
  }

  /** Read-only lookup: completed prompts retain ownership for late/repeated replies. */
  async ownsReply(event: LycheeEvent): Promise<boolean> {
    if (!event.reply_to_whatsapp_message_id) return false;
    const rows = await this.db.query(
      `SELECT event_id FROM lychee_intake_events WHERE channel_id=? AND sender_phone=?
       AND prompt_whatsapp_message_id=? LIMIT 2`,
      [
        event.channel_id,
        lycheeSender(event),
        event.reply_to_whatsapp_message_id,
      ],
    );
    if (rows.length > 1)
      throw new ConflictException('Ambiguous prompt ownership');
    return rows.length === 1;
  }

  /** Link the actual transport receipt; repeated identical mappings are safe. */
  async recordPrompt(
    eventId: string,
    channelId: string,
    owner: string,
    promptId: string,
  ): Promise<void> {
    if (
      typeof promptId !== 'string' ||
      !promptId.length ||
      promptId.length > 255
    ) {
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
       WHERE event_id=? AND channel_id=? AND firebase_id=?`,
      [eventId, channelId, owner],
    );
    if (rows.length !== 1 || rows[0].prompt_whatsapp_message_id !== promptId) {
      throw new ConflictException('Prompt mapping not recorded');
    }
  }
}
