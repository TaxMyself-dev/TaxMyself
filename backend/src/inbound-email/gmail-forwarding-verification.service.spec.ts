import { InternalServerErrorException } from '@nestjs/common';
import { MailService } from 'src/mail/mail.service';
import { GmailForwardingVerificationService } from './gmail-forwarding-verification.service';

describe('GmailForwardingVerificationService', () => {
  const findOne = jest.fn();
  const sendMail = jest.fn();
  let service: GmailForwardingVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GmailForwardingVerificationService(
      { findOne } as any,
      { sendMail } as unknown as MailService,
    );
  });

  it('relays only the safe Google confirmation link to the account owner', async () => {
    findOne.mockResolvedValue({ email: 'owner@example.com' });
    sendMail.mockResolvedValue(undefined);

    const result = await service.relayIfApplicable({
      firebaseId: 'owner-firebase-id',
      sender: 'forwarding-noreply@google.com',
      plainBody: [
        'Click the link to confirm forwarding:',
        'https://mail-settings.google.com/mail/vf-safeOpaqueToken',
        'Ignore this unsafe link: https://evil.example/phish',
      ].join('\n'),
    });

    expect(result).toBe(true);
    expect(findOne).toHaveBeenCalledWith({
      where: { firebaseId: 'owner-firebase-id' },
      select: ['email'],
    });
    expect(sendMail).toHaveBeenCalledWith(
      'owner@example.com',
      'אישור העברת מיילים מ-Gmail ל-Keepintax',
      expect.stringContaining(
        'https://mail-settings.google.com/mail/vf-safeOpaqueToken',
      ),
    );
    expect(sendMail.mock.calls[0][2]).not.toContain('evil.example');
    expect(sendMail.mock.calls[0][2]).not.toContain('owner-firebase-id');
  });

  it('accepts the Google sender inside a display-name From header', async () => {
    findOne.mockResolvedValue({ email: 'owner@example.com' });

    await expect(service.relayIfApplicable({
      firebaseId: 'owner-firebase-id',
      from: 'Gmail Team <forwarding-noreply@google.com>',
      strippedText:
        'https://mail.google.com/mail/vf-anotherOpaqueToken',
    })).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('ignores arbitrary attachment-free messages', async () => {
    await expect(service.relayIfApplicable({
      firebaseId: 'owner-firebase-id',
      sender: 'supplier@example.com',
      plainBody: 'https://mail-settings.google.com/mail/vf-token',
    })).resolves.toBe(false);

    expect(findOne).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('ignores a Google-looking message with an untrusted link', async () => {
    await expect(service.relayIfApplicable({
      firebaseId: 'owner-firebase-id',
      sender: 'forwarding-noreply@google.com',
      plainBody: 'https://mail-settings.google.com.evil.example/mail/vf-token',
    })).resolves.toBe(false);

    expect(findOne).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('fails retryably when the mailbox owner has no delivery email', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.relayIfApplicable({
      firebaseId: 'missing-owner',
      sender: 'forwarding-noreply@google.com',
      plainBody: 'https://mail-settings.google.com/mail/vf-token',
    })).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('propagates delivery failure so Mailgun can retry the webhook', async () => {
    findOne.mockResolvedValue({ email: 'owner@example.com' });
    sendMail.mockRejectedValue(new Error('temporary email provider failure'));

    await expect(service.relayIfApplicable({
      firebaseId: 'owner-firebase-id',
      sender: 'forwarding-noreply@google.com',
      plainBody: 'https://mail-settings.google.com/mail/vf-token',
    })).rejects.toThrow('temporary email provider failure');
  });
});
