import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeWhatsappPhone, WhatsappDevelopmentConfig } from './whatsapp-development.config';

export type RoutingResult = {
  status: 'READY' | 'UNKNOWN_SENDER' | 'AMBIGUOUS_SENDER' | 'BUSINESS_REQUIRED' | 'BUSINESS_NOT_ALLOWED';
  firebaseId?: string;
  businessNumber?: string;
  businesses?: string[];
};

@Injectable()
export class WhatsappRoutingService {
  constructor(private readonly config: WhatsappDevelopmentConfig) {}

  resolve(from: unknown, businessNumber?: unknown): RoutingResult {
    const phone = normalizeWhatsappPhone(from);
    if (!phone) throw new BadRequestException('Expected an Israeli mobile sender number');
    if (businessNumber !== undefined && typeof businessNumber !== 'string') {
      throw new BadRequestException('businessNumber must be a string');
    }
    const matches = this.config.contacts().filter(c => c.phone === phone);
    if (!matches.length) return { status: 'UNKNOWN_SENDER' };
    if (matches.length !== 1) return { status: 'AMBIGUOUS_SENDER' };
    const contact = matches[0];
    const requested = typeof businessNumber === 'string' ? businessNumber.trim() : '';
    if (requested && !contact.businesses.includes(requested)) return { status: 'BUSINESS_NOT_ALLOWED' };
    if (!requested && contact.businesses.length !== 1) {
      return { status: 'BUSINESS_REQUIRED', businesses: contact.businesses };
    }
    return { status: 'READY', firebaseId: contact.firebaseId, businessNumber: requested || contact.businesses[0] };
  }
}
