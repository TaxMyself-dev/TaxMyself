import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MailService } from 'src/mail/mail.service';
import { User } from 'src/users/user.entity';
import { Repository } from 'typeorm';

export interface GmailForwardingVerificationMessage {
  firebaseId: string;
  sender?: string;
  from?: string;
  plainBody?: string;
  strippedText?: string;
}

/**
 * Relays Gmail's one-time forwarding confirmation to the Keepintax account
 * owner. Dedicated inbound addresses are document pipes, not mailboxes, so
 * customers otherwise have nowhere to read Google's attachment-free message.
 *
 * Only a narrowly identified Google sender and Google's opaque `/mail/vf-...`
 * HTTPS confirmation URL are relayed. Raw inbound text/HTML is never forwarded.
 */
@Injectable()
export class GmailForwardingVerificationService {
  private static readonly ALLOWED_SENDERS = new Set([
    'forwarding-noreply@google.com',
    'forwarding-noreply@gmail.com',
  ]);

  private static readonly ALLOWED_HOSTS = new Set([
    'mail-settings.google.com',
    'mail.google.com',
  ]);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  async relayIfApplicable(
    message: GmailForwardingVerificationMessage,
  ): Promise<boolean> {
    const senders = [message.sender, message.from]
      .map(value => this.extractAddress(value))
      .filter((value): value is string => !!value);
    if (!senders.some(sender =>
      GmailForwardingVerificationService.ALLOWED_SENDERS.has(sender)
    )) {
      return false;
    }

    const confirmationUrl = this.extractConfirmationUrl(
      message.strippedText || message.plainBody || '',
    );
    if (!confirmationUrl) return false;

    const owner = await this.userRepo.findOne({
      where: { firebaseId: message.firebaseId },
      select: ['email'],
    });
    if (!owner?.email?.trim()) {
      throw new InternalServerErrorException(
        'Inbound email owner has no delivery address',
      );
    }

    const text = [
      'שלום,',
      '',
      'Gmail ביקש לאשר העברה אוטומטית לכתובת המסמכים של העסק ב-Keepintax.',
      'כדי לאשר את ההעברה, יש לפתוח את הקישור הבא:',
      confirmationUrl,
      '',
      'אם לא ביקשת להגדיר העברה אוטומטית, אין ללחוץ על הקישור.',
      '',
      'צוות Keepintax',
    ].join('\n');

    await this.mailService.sendMail(
      owner.email.trim(),
      'אישור העברת מיילים מ-Gmail ל-Keepintax',
      text,
    );
    return true;
  }

  private extractAddress(value: string | undefined): string | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return null;
    const bracketed = normalized.match(/<([^<>]+)>/);
    return (bracketed?.[1] ?? normalized).trim();
  }

  private extractConfirmationUrl(body: string): string | null {
    const candidates = String(body).match(/https:\/\/[^\s<>"']+/gi) ?? [];
    for (const rawCandidate of candidates) {
      const candidate = rawCandidate.replace(/[)\],.;]+$/, '');
      try {
        const url = new URL(candidate);
        if (
          url.protocol === 'https:' &&
          GmailForwardingVerificationService.ALLOWED_HOSTS.has(
            url.hostname.toLowerCase(),
          ) &&
          url.pathname.startsWith('/mail/vf-')
        ) {
          return url.toString();
        }
      } catch {
        // Ignore malformed or non-URL text from the inbound message.
      }
    }
    return null;
  }
}
