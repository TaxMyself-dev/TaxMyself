import { ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type {
  BusinessChoice,
  BusinessQuestionRequest,
} from './lychee-business-question';

export interface PromptDraft {
  kind: 'BUSINESS_QUESTION';
  documentEventId: string;
  choices: BusinessChoice[];
  request: BusinessQuestionRequest;
}
export interface PromptJob {
  event_id: string;
  channel_id: string;
  sender_phone: string;
  firebase_id: string;
  payload: PromptDraft & { providerMessageId?: string };
  payload_hash: string;
  status: 'PROMPT_SENDING' | 'PROMPT_LINKING';
  lease_token: string;
  attempts: number;
}
export const promptEventId = (channel: string, document: string) =>
  'prompt:' +
  createHash('sha256')
    .update(JSON.stringify([channel, document]))
    .digest('hex');
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const promptHash = (draft: PromptDraft) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          kind: draft.kind,
          documentEventId: draft.documentEventId,
          choices: draft.choices,
          request: draft.request,
        }),
      ),
    )
    .digest('hex');

/** Separate statuses in existing table. Prompt receipt lives in JSON, not prompt_whatsapp_message_id:
 * only the document owns that indexed ID, otherwise reply routing sees two owners. */
@Injectable()
export class LycheePromptStore {
  constructor(private readonly db: DataSource) {}

  async claim(): Promise<PromptJob | null> {
    await this.db
      .query(`UPDATE lychee_intake_events SET status='PROMPT_UNKNOWN',
      last_error='SEND_RESULT_UNKNOWN',lease_token=NULL,lease_until=NULL
      WHERE status='PROMPT_SENDING' AND lease_until < UTC_TIMESTAMP()`);
    await this.db
      .query(`UPDATE lychee_intake_events SET status='PROMPT_LINK',lease_token=NULL,lease_until=NULL
      WHERE status='PROMPT_LINKING' AND lease_until < UTC_TIMESTAMP()`);
    await this.db
      .query(`UPDATE lychee_intake_events SET status='PROMPT_LINK',last_error=NULL
      WHERE status='PROMPT_UNKNOWN' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.providerMessageId')) IS NOT NULL`);
    const token = randomUUID();
    await this.db.query(
      `UPDATE lychee_intake_events SET
      status=CASE WHEN status='PROMPT_LINK' THEN 'PROMPT_LINKING' ELSE 'PROMPT_SENDING' END,
      lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),attempts=attempts+1
      WHERE status IN ('PROMPT_PENDING','PROMPT_LINK') AND next_attempt_at<=UTC_TIMESTAMP()
      ORDER BY created_at LIMIT 1`,
      [token],
    );
    const rows = await this.db.query(
      `SELECT event_id,channel_id,sender_phone,firebase_id,payload,
      payload_hash,status,lease_token,attempts FROM lychee_intake_events WHERE lease_token=?`,
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

  async parent(job: PromptJob): Promise<any> {
    const rows = await this.db.query(
      `SELECT event_id,channel_id,sender_phone,firebase_id,status,
      business_choices,payload,prompt_whatsapp_message_id FROM lychee_intake_events
      WHERE event_id=? AND channel_id=? AND firebase_id=?`,
      [job.payload.documentEventId, job.channel_id, job.firebase_id],
    );
    if (rows.length !== 1)
      throw new ConflictException('Question document unavailable');
    const row = rows[0];
    return {
      ...row,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      business_choices:
        typeof row.business_choices === 'string'
          ? JSON.parse(row.business_choices)
          : row.business_choices,
    };
  }

  async receipt(job: PromptJob, providerId: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE lychee_intake_events
      SET payload=JSON_SET(payload,'$.providerMessageId',?),status='PROMPT_LINKING',last_error=NULL
      WHERE event_id=? AND lease_token=? AND status IN ('PROMPT_SENDING','PROMPT_LINKING')
      AND (JSON_EXTRACT(payload,'$.providerMessageId') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(payload,'$.providerMessageId'))=?)`,
      [providerId, job.event_id, job.lease_token, providerId],
    );
    if (result.affectedRows !== 1)
      throw new ConflictException('Question receipt not persisted');
    job.payload.providerMessageId = providerId;
    job.status = 'PROMPT_LINKING';
  }

  async finish(
    job: PromptJob,
    status:
      | 'PROMPT_SENT'
      | 'PROMPT_CANCELLED'
      | 'PROMPT_UNKNOWN'
      | 'PROMPT_PENDING'
      | 'PROMPT_LINK',
    error: string | null = null,
  ) {
    const result = await this.db.query(
      `UPDATE lychee_intake_events SET status=?,last_error=?,
      next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND),lease_token=NULL,lease_until=NULL
      WHERE event_id=? AND lease_token=?`,
      [status, error, job.event_id, job.lease_token],
    );
    if (result.affectedRows !== 1)
      throw new ConflictException('Question lease no longer owned');
  }
}
