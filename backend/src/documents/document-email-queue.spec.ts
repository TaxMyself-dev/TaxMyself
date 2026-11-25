import { DocumentEmailQueue } from './document-email-queue.service';
import { DocumentEmailSchedulerController } from './document-email-scheduler.controller';
import { DocumentEmailSchedulerGuard } from './document-email-scheduler.guard';
import { Readable } from 'stream';
import * as admin from 'firebase-admin';
jest.mock('firebase-admin', () => ({ storage: jest.fn() }));

const payload = {
  to: 'recipient@example.test',
  subject: 'test',
  text: 'test',
  attachmentName: 'document.pdf',
  filePath: 'systemDocs/test/original/id/document.pdf',
};
describe('document recipient email outbox', () => {
  const env = { ...process.env };
  let queue: DocumentEmailQueue;
  let db: { query: jest.Mock };
  let mail: { sendMailWithAttachment: jest.Mock };
  let stream: jest.Mock;
  beforeEach(() => {
    process.env.DOCUMENT_EMAIL_QUEUE_ENABLED = 'true';
    delete process.env.DOCUMENT_EMAIL_QUEUE_RUNNER;
    db = { query: jest.fn().mockResolvedValue({ affectedRows: 1 }) };
    mail = { sendMailWithAttachment: jest.fn().mockResolvedValue({}) };
    queue = new DocumentEmailQueue(db as any, mail as any);
    stream = jest.fn(() => Readable.from([Buffer.from('%PDF-saved-original')]));
    (admin.storage as unknown as jest.Mock).mockReturnValue({
      bucket: () => ({ file: () => ({ createReadStream: stream }) }),
    });
    jest.spyOn((queue as any).logger, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });
  const job = (attempts = 1) => ({
    id: 7,
    document_id: 99,
    payload: JSON.stringify(payload),
    attempts,
  });
  const deliver = (attempts = 1) =>
    (queue as any).deliver(job(attempts), 'lease-token');
  const finalState = () =>
    db.query.mock.calls
      .filter(([sql]) => sql.includes('last_error = ?'))
      .pop()[1][0];

  it('enqueues with the caller transaction and does not send', async () => {
    const manager = { query: jest.fn().mockResolvedValue({ insertId: 7 }) };
    await expect(queue.enqueue(manager as any, 99, payload)).resolves.toBe(7);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO document_email_outbox'),
      [99, JSON.stringify(payload)],
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
  });
  it('uses the committed signed buffer immediately without downloading it', async () => {
    jest.spyOn(queue, 'round').mockResolvedValue({ processed: 0 });
    queue.kick(7, Buffer.from('%PDF-in-memory'));
    db.query.mockResolvedValueOnce([{ id: 99 }]);
    await deliver();
    expect(stream).not.toHaveBeenCalled();
    expect(mail.sendMailWithAttachment.mock.calls[0][3].toString()).toBe(
      '%PDF-in-memory',
    );
    expect(finalState()).toBe('SENT');
    expect((queue as any).attachmentBytes).toBe(0);
  });
  it('recovers a persisted pending job in a fresh process using its saved original', async () => {
    db.query
      .mockResolvedValueOnce({ affectedRows: 0 }) // expired leases
      .mockResolvedValueOnce({ affectedRows: 1 }) // claim
      .mockResolvedValueOnce([job()])
      .mockResolvedValueOnce([{ id: 99 }]) // document still exists
      .mockResolvedValueOnce({ affectedRows: 1 }) // renew
      .mockResolvedValueOnce({ affectedRows: 1 }) // finish
      .mockResolvedValueOnce({ affectedRows: 0 }); // queue empty
    await expect(queue.round()).resolves.toEqual({ processed: 1 });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(finalState()).toBe('SENT');
    expect(db.query.mock.calls[1][0]).toContain(
      'ORDER BY next_attempt_at, id LIMIT 1',
    );
  });
  it('cancels jobs whose document/path is unavailable without sending', async () => {
    db.query.mockResolvedValueOnce([]);
    await deliver();
    expect(finalState()).toBe('CANCELLED');
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
  });
  it('does not send after another worker reclaimed its lease', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 99 }])
      .mockResolvedValueOnce({ affectedRows: 0 });
    await deliver();
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
  });
  it.each([
    [1, 'RETRY'],
    [5, 'FAILED'],
  ])('bounds rate-limit retries at attempt %s', async (attempt, state) => {
    db.query.mockResolvedValueOnce([{ id: 99 }]);
    mail.sendMailWithAttachment.mockRejectedValue({ status: 429 });
    await deliver(attempt as number);
    expect(finalState()).toBe(state);
  });
  it.each([{ code: 'ETIMEDOUT' }, { status: 500 }])(
    'does not automatically repeat ambiguous delivery %j',
    async (error) => {
      db.query.mockResolvedValueOnce([{ id: 99 }]);
      mail.sendMailWithAttachment.mockRejectedValue(error);
      await deliver();
      expect(finalState()).toBe('UNKNOWN');
    },
  );
  it('records permanent provider rejection as failed', async () => {
    db.query.mockResolvedValueOnce([{ id: 99 }]);
    mail.sendMailWithAttachment.mockRejectedValue({ status: 401 });
    await deliver();
    expect(finalState()).toBe('FAILED');
  });
  it('retries attachment failures without calling the mail provider', async () => {
    db.query.mockResolvedValueOnce([{ id: 99 }]);
    stream.mockImplementation(
      () =>
        new Readable({
          read() {
            this.destroy(Error('storage down'));
          },
        }),
    );
    await deliver();
    expect(finalState()).toBe('RETRY');
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
  });
  it('aborts a stalled attachment stream and retries without sending', async () => {
    jest.useFakeTimers();
    try {
      const stalled = new Readable({ read() {} });
      stream.mockReturnValue(stalled);
      const operation = (queue as any).downloadAttachment(payload.filePath);
      const rejected = expect(operation).rejects.toThrow(
        'ATTACHMENT_DOWNLOAD_TIMEOUT',
      );
      jest.advanceTimersByTime(15000);
      await rejected;
      expect(stalled.destroyed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
  it('rejects a storage stream that closes without end/error instead of hanging', async () => {
    stream.mockImplementation(
      () =>
        new Readable({
          read() {
            this.destroy();
          },
        }),
    );
    await expect(
      (queue as any).downloadAttachment(payload.filePath),
    ).rejects.toThrow('ATTACHMENT_DOWNLOAD_CLOSED');
  });
  it('rejects oversized attachments before sending', async () => {
    db.query.mockResolvedValueOnce([{ id: 99 }]);
    stream.mockImplementation(() =>
      Readable.from([Buffer.alloc(25 * 1024 * 1024 + 1)]),
    );
    await deliver();
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
    expect(finalState()).toBe('RETRY');
  });
  it('does not start a second local round while one is pending', async () => {
    let release: (value: unknown) => void;
    db.query
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce({ affectedRows: 0 });
    const first = queue.round();
    await expect(queue.round()).resolves.toEqual({ processed: 0 });
    release({ affectedRows: 0 });
    await first;
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  it('reaps expired sends as unknown instead of claiming them for a duplicate send', async () => {
    db.query
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 0 });
    await queue.round();
    expect(db.query.mock.calls[0][0]).toContain("SET state = 'UNKNOWN'");
    expect(db.query.mock.calls[1][0]).toContain(
      "WHERE state IN ('PENDING', 'RETRY')",
    );
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
  });
  it('does not query the prepared-only table while disabled', async () => {
    delete process.env.DOCUMENT_EMAIL_QUEUE_ENABLED;
    await expect(queue.round()).resolves.toEqual({ processed: 0 });
    expect(db.query).not.toHaveBeenCalled();
  });
  it('requires scheduler mode on Cloud Run and reuses the existing OIDC guard', () => {
    process.env.K_SERVICE = 'backend';
    expect(() => queue.onModuleInit()).toThrow(
      'requires authenticated scheduler',
    );
    process.env.DOCUMENT_EMAIL_QUEUE_RUNNER = 'scheduler';
    process.env.DOCUMENT_AI_DISPATCH_MODE = 'cron';
    expect(() => queue.onModuleInit()).not.toThrow();
    expect(
      Reflect.getMetadata('__guards__', DocumentEmailSchedulerController),
    ).toContain(DocumentEmailSchedulerGuard);
  });
  it('scheduler mode does not retain buffers or start fire-and-forget work', () => {
    process.env.DOCUMENT_EMAIL_QUEUE_RUNNER = 'scheduler';
    const round = jest.spyOn(queue, 'round');
    queue.kick(7, Buffer.from('pdf'));
    expect(round).not.toHaveBeenCalled();
    expect((queue as any).attachmentBytes).toBe(0);
  });
});
