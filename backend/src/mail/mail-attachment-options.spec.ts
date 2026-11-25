import { MailService } from './mail.service';
import * as Brevo from 'sib-api-v3-sdk';
describe('queued attachment transport options', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses the SDK request timeout without mutating the shared client or logging document/provider data', async () => {
    const original = new Brevo.ApiClient();
    const timeout = original.timeout;
    let transport: any;
    const send = jest
      .fn()
      .mockResolvedValue({ messageId: 'private-provider-message' });
    jest
      .spyOn(Brevo, 'TransactionalEmailsApi')
      .mockImplementation((client: any) => {
        transport = client;
        return { sendTransacEmail: send } as any;
      });
    const service = Object.create(MailService.prototype) as any;
    service.client = { sendTransacEmail: jest.fn() };
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await service.sendMailWithAttachment(
      'private@example.test',
      'private subject',
      'private text',
      Buffer.from('signed-pdf'),
      'private.pdf',
      'application/pdf',
      { timeoutMs: 30000, sanitizedLogs: true },
    );
    expect(transport.timeout).toBe(30000);
    expect(original.timeout).toBe(timeout);
    expect(service.client.sendTransacEmail).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: [
          {
            name: 'private.pdf',
            content: Buffer.from('signed-pdf').toString('base64'),
          },
        ],
      }),
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it('keeps failures intact and sanitized for outbox classification', async () => {
    const failure = Object.assign(Error('private message'), { status: 429 });
    jest
      .spyOn(Brevo, 'TransactionalEmailsApi')
      .mockImplementation(
        () =>
          ({ sendTransacEmail: jest.fn().mockRejectedValue(failure) } as any),
      );
    const service = Object.create(MailService.prototype) as any;
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      service.sendMailWithAttachment(
        'private@example.test',
        'subject',
        'text',
        Buffer.from('signed'),
        'file.pdf',
        'application/pdf',
        { timeoutMs: 30000, sanitizedLogs: true },
      ),
    ).rejects.toBe(failure);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
