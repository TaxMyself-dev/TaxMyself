import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { MailService } from '../mail/mail.service';

export interface DocumentEmailPayload {
  to: string;
  subject: string;
  text: string;
  attachmentName: string;
  filePath: string;
}

@Injectable()
export class DocumentEmailQueue {
  private readonly logger = new Logger(DocumentEmailQueue.name);
  private running = false;
  private readonly attachments = new Map<
    number,
    { buffer: Buffer; expires: number }
  >();
  private attachmentBytes = 0;
  private readonly maxAttachmentBytes = 32 * 1024 * 1024;
  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    if (!this.enabled()) return;
    const runner = process.env.DOCUMENT_EMAIL_QUEUE_RUNNER || 'cron';
    if (!['cron', 'scheduler'].includes(runner))
      throw Error('Invalid document email queue runner');
    if (process.env.K_SERVICE && runner !== 'scheduler')
      throw Error(
        'Cloud Run document email delivery requires authenticated scheduler mode',
      );
  }

  enabled() {
    return process.env.DOCUMENT_EMAIL_QUEUE_ENABLED === 'true';
  }

  /** Must use the issuance transaction. Never send before its commit. */
  async enqueue(
    manager: EntityManager,
    documentId: number,
    payload: DocumentEmailPayload,
  ): Promise<number> {
    const result = await manager.query(
      `INSERT INTO document_email_outbox
      (document_id, payload, state, attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, 'PENDING', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [documentId, JSON.stringify(payload)],
    );
    return Number(result.insertId);
  }

  /** Called only after commit. This is an optimization; DB is the source of truth. */
  kick(id: number, signedOriginal: Buffer) {
    if (
      !this.enabled() ||
      process.env.DOCUMENT_EMAIL_QUEUE_RUNNER === 'scheduler'
    )
      return;
    this.pruneAttachments();
    if (signedOriginal.length <= this.maxAttachmentBytes) {
      while (
        this.attachments.size &&
        (this.attachmentBytes + signedOriginal.length >
          this.maxAttachmentBytes ||
          this.attachments.size >= 128)
      ) {
        this.dropAttachment(this.attachments.keys().next().value);
      }
      this.dropAttachment(id);
      this.attachments.set(id, {
        buffer: signedOriginal,
        expires: Date.now() + 60000,
      });
      this.attachmentBytes += signedOriginal.length;
    }
    // The HTTP request does not await delivery. A cron/scheduler recovers queued work.
    void this.round().catch(() =>
      this.logger.warn('document_email_round_failed'),
    );
  }

  private dropAttachment(id: number) {
    const value = this.attachments.get(id);
    if (value) this.attachmentBytes -= value.buffer.length;
    this.attachments.delete(id);
  }
  private pruneAttachments() {
    for (const [id, value] of this.attachments)
      if (value.expires <= Date.now()) this.dropAttachment(id);
  }

  @Cron('*/10 * * * * *')
  async tick() {
    if (process.env.DOCUMENT_EMAIL_QUEUE_RUNNER === 'scheduler') return;
    try {
      await this.round();
    } catch {
      this.logger.warn('document_email_round_failed');
    }
  }

  /** Bounded, request-bound entry point for Cloud Run's authenticated scheduler. */
  async round(): Promise<{ processed: number }> {
    if (!this.enabled() || this.running) return { processed: 0 };
    this.running = true;
    let processed = 0;
    const deadline = Date.now() + 45000;
    try {
      this.pruneAttachments();
      // A crash or transport timeout may have happened after provider acceptance.
      // Do not automatically resend that ambiguous delivery.
      await this.dataSource.query(`UPDATE document_email_outbox
        SET state = 'UNKNOWN', lease_token = NULL, lease_until = NULL,
          last_error = 'DELIVERY_OUTCOME_UNKNOWN', updated_at = UTC_TIMESTAMP(3)
        WHERE state = 'SENDING' AND lease_until <= UTC_TIMESTAMP(3)`);
      while (processed < 5 && Date.now() < deadline) {
        const token = randomUUID();
        const claimed = await this.dataSource.query(
          `UPDATE document_email_outbox
          SET state = 'SENDING', lease_token = ?, lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 120 SECOND),
            attempts = attempts + 1, updated_at = UTC_TIMESTAMP(3)
          WHERE state IN ('PENDING', 'RETRY') AND next_attempt_at <= UTC_TIMESTAMP(3)
          ORDER BY next_attempt_at, id LIMIT 1`,
          [token],
        );
        if (!claimed.affectedRows) break;
        const [job] = await this.dataSource.query(
          `SELECT id, document_id, payload, attempts FROM document_email_outbox WHERE lease_token = ? AND state = 'SENDING'`,
          [token],
        );
        if (!job) break;
        await this.deliver(job, token);
        processed++;
      }
      return { processed };
    } finally {
      this.running = false;
      this.pruneAttachments();
    }
  }

  private async deliver(job: any, token: string) {
    let sending = false;
    try {
      const payload: DocumentEmailPayload =
        typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      // Match the committed document AND original path; never email rolled-back/deleted/replaced files.
      const [doc] = await this.dataSource.query(
        'SELECT id FROM documents WHERE id = ? AND file = ?',
        [job.document_id, payload.filePath],
      );
      if (!doc) {
        await this.finish(job.id, token, 'CANCELLED', 'DOCUMENT_UNAVAILABLE');
        return;
      }
      let pdf = this.attachments.get(Number(job.id))?.buffer;
      if (!pdf) {
        pdf = await this.downloadAttachment(payload.filePath);
      }
      if (pdf.length > 25 * 1024 * 1024) throw Error('ATTACHMENT_TOO_LARGE');
      // Refresh fencing immediately before the external side effect.
      const renewed = await this.dataSource.query(
        `UPDATE document_email_outbox
        SET lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 120 SECOND)
        WHERE id = ? AND lease_token = ? AND state = 'SENDING' AND lease_until > UTC_TIMESTAMP(3)`,
        [job.id, token],
      );
      if (!renewed.affectedRows) return;
      sending = true;
      await this.mail.sendMailWithAttachment(
        payload.to,
        payload.subject,
        payload.text,
        pdf,
        payload.attachmentName,
        'application/pdf',
        { timeoutMs: 30000, sanitizedLogs: true },
      );
      await this.finish(job.id, token, 'SENT', null);
    } catch (error) {
      // Retry pre-send failures and explicit provider rate-limit rejection only.
      // Timeouts, disconnects and server errors can hide an accepted email.
      const status = Number(
        error?.status ?? error?.response?.status ?? error?.statusCode,
      );
      const safeRetry = !sending || status === 429;
      const permanentRejection =
        sending &&
        status >= 400 &&
        status < 500 &&
        ![408, 429].includes(status);
      const state = permanentRejection
        ? 'FAILED'
        : safeRetry
        ? job.attempts < 5
          ? 'RETRY'
          : 'FAILED'
        : 'UNKNOWN';
      const code = permanentRejection
        ? 'PROVIDER_REJECTED'
        : safeRetry
        ? sending
          ? 'PROVIDER_RATE_LIMIT'
          : 'ATTACHMENT_PREPARATION_FAILED'
        : 'DELIVERY_OUTCOME_UNKNOWN';
      await this.finish(
        job.id,
        token,
        state,
        code,
        Math.min(3600, 30 * 2 ** (job.attempts - 1)),
      );
      this.logger.warn(
        JSON.stringify({
          event: 'document_email_delivery',
          jobId: job.id,
          state,
          code,
        }),
      );
    } finally {
      this.dropAttachment(Number(job.id));
    }
  }

  private downloadAttachment(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const stream = admin
        .storage()
        .bucket(process.env.FIREBASE_STORAGE_BUCKET)
        .file(filePath)
        .createReadStream();
      const chunks: Buffer[] = [];
      let size = 0;
      let completed = false;
      const timer = setTimeout(
        () => stream.destroy(Error('ATTACHMENT_DOWNLOAD_TIMEOUT')),
        15000,
      );
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 25 * 1024 * 1024)
          stream.destroy(Error('ATTACHMENT_TOO_LARGE'));
        else chunks.push(chunk);
      });
      stream.once('error', (error) => {
        completed = true;
        clearTimeout(timer);
        reject(error);
      });
      stream.once('end', () => {
        completed = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
      stream.once('close', () => {
        clearTimeout(timer);
        if (!completed) reject(Error('ATTACHMENT_DOWNLOAD_CLOSED'));
      });
    });
  }

  private async finish(
    id: number,
    token: string,
    state: string,
    code: string | null,
    delay = 0,
  ) {
    await this.dataSource.query(
      `UPDATE document_email_outbox SET state = ?, last_error = ?,
      next_attempt_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND),
      sent_at = IF(? = 'SENT', UTC_TIMESTAMP(3), sent_at),
      lease_token = NULL, lease_until = NULL, updated_at = UTC_TIMESTAMP(3)
      WHERE id = ? AND lease_token = ? AND state = 'SENDING'`,
      [state, code, delay, state, id, token],
    );
  }
}
