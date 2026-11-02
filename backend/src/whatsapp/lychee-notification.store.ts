import { ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { BusinessQuestionRequest } from './lychee-business-question';
import { lycheeSender } from './lychee-sender';
import {
  reminderSnapshot,
  selectedBusinessSnapshot,
  sameSelectionSnapshot,
} from './lychee-selection-reminder';

export interface ResultDraft {
  kind: 'DOCUMENT_RESULT';
  documentEventId: string;
  result:
    | 'IMPORTED'
    | 'ALREADY_IMPORTED'
    | 'FAILED'
    | 'REJECTED_BUSINESS'
    | 'BLOCKED_IMPORT'
    | 'BUSINESS_LOCKED';
  owner: string | null;
  business: string | null;
  request: BusinessQuestionRequest;
}
export interface ResultJob {
  event_id: string;
  channel_id: string;
  sender_phone: string;
  payload: ResultDraft & { providerMessageId?: string };
  payload_hash: string;
  lease_token: string;
  status: 'NOTICE_SENDING' | 'NOTICE_RECORDING';
}
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const resultEventId = (draft: ResultDraft) =>
  'notice:' +
  hash([draft.request.channel_id, draft.documentEventId, draft.result]);
export const resultHash = (draft: ResultDraft) =>
  hash([
    draft.kind,
    draft.documentEventId,
    draft.result,
    draft.owner,
    draft.business,
    draft.request.channel_id,
    draft.request.phone,
    draft.request.text,
    draft.request.reply_to_whatsapp_message_id,
  ]);

/** Only committed document outcomes qualify. Unknown/unregistered recipients are checked again before send. */
export function documentResult(row: any): ResultDraft | null {
  const event =
    typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  const sender = event && lycheeSender(event);
  const reminder =
    row.status === 'BUSINESS_LOCKED' ? reminderSnapshot(row) : null;
  if (
    (!event?.has_media && !reminder) ||
    !sender ||
    sender !== row.sender_phone ||
    event.channel_id !== row.channel_id ||
    event.event_id !== row.event_id ||
    typeof event.whatsapp_message_id !== 'string' ||
    !event.whatsapp_message_id.trim() ||
    event.whatsapp_message_id.length > 255 ||
    ![
      'IMPORTED',
      'ALREADY_IMPORTED',
      'FAILED',
      'REJECTED_BUSINESS',
      'BLOCKED_IMPORT',
      'BUSINESS_LOCKED',
    ].includes(row.status)
  )
    return null;
  if (
    row.status === 'BUSINESS_LOCKED' &&
    (!reminder ||
      event.has_media ||
      !row.firebase_id ||
      reminder.businessNumber !== row.business_number ||
      reminder.questionId !== event.reply_to_whatsapp_message_id)
  )
    return null;
  const success = ['IMPORTED', 'ALREADY_IMPORTED'].includes(row.status);
  if (
    success &&
    (!row.drive_file_id || !row.firebase_id || !row.business_number)
  )
    return null;
  const blockTexts: Record<string, string> = {
    DRIVE_FOLDER_MISSING:
      'לא ניתן לשמור את המסמך כי תיק המסמכים של העסק עדיין לא הוגדר. יש לפנות לתמיכה.',
    UNSUPPORTED_MEDIA_CONTENT:
      'סוג הקובץ אינו נתמך. אפשר לשלוח PDF או תמונת JPG/PNG.',
    INVALID_MEDIA_SIZE:
      'הקובץ ריק או גדול מדי. יש לשלוח קובץ תקין בגודל של עד 10 מגה־בייט.',
  };
  const text =
    row.status === 'BUSINESS_LOCKED'
      ? `המסמך הזה כבר שויך לעסק ${
          reminder!.name
        }. כדי לשייך אותו לעסק אחר, שלח אותו מחדש.`
      : row.status === 'BLOCKED_IMPORT'
      ? blockTexts[row.last_error] ||
        'לא ניתן לקלוט את המסמך כרגע. אפשר לפנות לתמיכה.'
      : row.status === 'REJECTED_BUSINESS'
      ? 'לא הצלחנו לשייך את המסמך לעסק בחשבון שלך. אפשר לפנות לתמיכה.'
      : row.status === 'FAILED'
      ? 'לא הצלחנו להשלים את שמירת המסמך אחרי כמה ניסיונות. אפשר לפנות לתמיכה.'
      : row.status === 'ALREADY_IMPORTED'
      ? `המסמך כבר קיים בדרייב של עסק ${row.business_number}. לא נוצר עותק נוסף.`
      : `המסמך נשמר בהצלחה בדרייב של עסק ${row.business_number}.`;
  return {
    kind: 'DOCUMENT_RESULT',
    documentEventId: row.event_id,
    result: row.status,
    owner: row.firebase_id || null,
    business: row.business_number || null,
    request: {
      channel_id: row.channel_id,
      phone: sender,
      text,
      reply_to_whatsapp_message_id:
        reminder?.documentWhatsappMessageId || event.whatsapp_message_id,
    },
  };
}

type Sql = { query: (sql: string, values?: any[]) => Promise<any> };
const resultColumns =
  'event_id,channel_id,message_id,sender_phone,payload,status,firebase_id,business_number,business_choices,drive_file_id,last_error';
/** The terminal transition and its outbox entry commit together; old completed documents are never backfilled. */
export async function commitDocumentResults(
  db: DataSource,
  change: (sql: Sql) => Promise<string[]>,
): Promise<void> {
  const runner = db.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const ids = await change(runner);
    for (const id of ids) {
      const rows = await runner.query(
        `SELECT ${resultColumns} FROM lychee_intake_events WHERE event_id=?`,
        [id],
      );
      const row = rows[0];
      const draft = row && documentResult(row);
      if (!draft) continue;
      const key = resultEventId(draft),
        digest = resultHash(draft);
      await runner.query(
        `INSERT INTO lychee_intake_events
        (event_id,channel_id,message_id,sender_phone,payload,payload_hash,status,firebase_id,business_number)
        VALUES (?,?,?,?,?,?,'NOTICE_PENDING',?,?) ON DUPLICATE KEY UPDATE event_id=event_id`,
        [
          key,
          row.channel_id,
          row.message_id,
          row.sender_phone,
          JSON.stringify(draft),
          digest,
          draft.owner,
          draft.business,
        ],
      );
      const saved = await runner.query(
        'SELECT payload_hash FROM lychee_intake_events WHERE event_id=?',
        [key],
      );
      if (saved.length !== 1 || saved[0].payload_hash !== digest)
        throw new ConflictException('Document result draft conflict');
    }
    await runner.commitTransaction();
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

/** Outbox states share the existing table, and are excluded from intake/prompt claims. */
@Injectable()
export class LycheeNotificationStore {
  constructor(private readonly db: DataSource) {}

  async claim(): Promise<ResultJob | null> {
    await this.db
      .query(`UPDATE lychee_intake_events SET status='NOTICE_UNKNOWN',
      last_error='SEND_RESULT_UNKNOWN',lease_token=NULL,lease_until=NULL
      WHERE status='NOTICE_SENDING' AND lease_until<UTC_TIMESTAMP()`);
    await this.db
      .query(`UPDATE lychee_intake_events SET status='NOTICE_RECORD',lease_token=NULL,lease_until=NULL
      WHERE status='NOTICE_RECORDING' AND lease_until<UTC_TIMESTAMP()`);
    await this.db
      .query(`UPDATE lychee_intake_events SET status='NOTICE_RECORD',last_error=NULL
      WHERE status='NOTICE_UNKNOWN' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.providerMessageId')) IS NOT NULL`);
    const token = randomUUID();
    await this.db.query(
      `UPDATE lychee_intake_events SET
      status=CASE WHEN status='NOTICE_RECORD' THEN 'NOTICE_RECORDING' ELSE 'NOTICE_SENDING' END,
      lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),attempts=attempts+1
      WHERE status IN ('NOTICE_PENDING','NOTICE_RECORD') AND next_attempt_at<=UTC_TIMESTAMP()
      ORDER BY created_at LIMIT 1`,
      [token],
    );
    const rows = await this.db.query(
      `SELECT event_id,channel_id,sender_phone,payload,payload_hash,status,lease_token
      FROM lychee_intake_events WHERE lease_token=?`,
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

  async parent(job: ResultJob): Promise<any> {
    const rows = await this.db.query(
      `SELECT ${resultColumns} FROM lychee_intake_events WHERE event_id=? AND channel_id=?`,
      [job.payload.documentEventId, job.channel_id],
    );
    if (rows.length !== 1) return null;
    const row = rows[0];
    if (row.status === 'BUSINESS_LOCKED') {
      const snapshot = reminderSnapshot(row);
      if (!snapshot) return null;
      const originals = await this.db.query(
        `SELECT event_id,channel_id,sender_phone,firebase_id,status,
        business_number,business_choices,payload,prompt_whatsapp_message_id FROM lychee_intake_events
        WHERE event_id=? AND channel_id=?`,
        [snapshot.documentEventId, row.channel_id],
      );
      const event =
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const expected =
        originals.length === 1 &&
        selectedBusinessSnapshot(originals[0], event, row.firebase_id);
      if (!expected || !sameSelectionSnapshot(expected, snapshot)) return null;
    }
    return row;
  }

  async receipt(job: ResultJob, providerId: string): Promise<void> {
    if (
      typeof providerId !== 'string' ||
      !providerId.trim() ||
      providerId.length > 255
    )
      throw new ConflictException('Invalid notification receipt');
    const changed = await this.db.query(
      `UPDATE lychee_intake_events SET
      payload=JSON_SET(payload,'$.providerMessageId',?),status='NOTICE_RECORDING',last_error=NULL
      WHERE event_id=? AND lease_token=? AND status IN ('NOTICE_SENDING','NOTICE_RECORDING')
      AND (JSON_EXTRACT(payload,'$.providerMessageId') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(payload,'$.providerMessageId'))=?)`,
      [providerId, job.event_id, job.lease_token, providerId],
    );
    if (changed.affectedRows !== 1)
      throw new ConflictException('Notification receipt not persisted');
    job.payload.providerMessageId = providerId;
    job.status = 'NOTICE_RECORDING';
  }

  async finish(
    job: ResultJob,
    status:
      | 'NOTICE_SENT'
      | 'NOTICE_UNKNOWN'
      | 'NOTICE_PENDING'
      | 'NOTICE_RECORD'
      | 'NOTICE_CANCELLED',
    error: string | null = null,
  ): Promise<void> {
    const changed = await this.db.query(
      `UPDATE lychee_intake_events SET status=?,last_error=?,
      lease_token=NULL,lease_until=NULL,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)
      WHERE event_id=? AND lease_token=?`,
      [status, error, job.event_id, job.lease_token],
    );
    if (changed.affectedRows !== 1)
      throw new ConflictException('Notification lease no longer owned');
  }
}
