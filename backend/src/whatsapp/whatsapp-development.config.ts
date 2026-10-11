import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

export interface DevelopmentContact {
  phone: string;
  firebaseId: string;
  businesses: string[];
}

/** Explicit test bindings only. User.phone is not proof of account ownership. */
@Injectable()
export class WhatsappDevelopmentConfig {
  authorize(token: unknown): void {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.WHATSAPP_DEV_ENABLED !== 'true'
    ) {
      throw new NotFoundException();
    }
    const expected = process.env.WHATSAPP_DEV_TOKEN;
    if (!expected || expected.length < 24) throw new NotFoundException();
    const supplied =
      typeof token === 'string' ? Buffer.from(token) : Buffer.alloc(0);
    const secret = Buffer.from(expected);
    if (
      supplied.length !== secret.length ||
      !timingSafeEqual(supplied, secret)
    ) {
      throw new UnauthorizedException('Invalid development token');
    }
  }

  contacts(): DevelopmentContact[] {
    let contacts: DevelopmentContact[];
    try {
      contacts = JSON.parse(process.env.WHATSAPP_DEV_CONTACTS || '[]');
    } catch {
      throw new BadRequestException(
        'Invalid WHATSAPP_DEV_CONTACTS configuration',
      );
    }
    if (
      !Array.isArray(contacts) ||
      contacts.some(
        (c) =>
          !c ||
          typeof c.firebaseId !== 'string' ||
          !c.firebaseId.trim() ||
          !Array.isArray(c.businesses) ||
          !c.businesses.length ||
          c.businesses.some((b) => typeof b !== 'string' || !b.trim()) ||
          !normalizeWhatsappPhone(c.phone),
      )
    ) {
      throw new BadRequestException('Invalid development contact binding');
    }
    return contacts.map((c) => ({
      ...c,
      phone: normalizeWhatsappPhone(c.phone),
      businesses: [...new Set(c.businesses)],
    }));
  }
}

export function normalizeWhatsappPhone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value)) return null;
  let digits = value.replace(/[+\s()-]/g, '');
  if (/^05\d{8}$/.test(digits)) digits = `972${digits.slice(1)}`;
  return /^9725\d{8}$/.test(digits) ? digits : null;
}
