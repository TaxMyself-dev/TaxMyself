import {
  Injectable,
  InternalServerErrorException,
  NotAcceptableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Business } from 'src/business/business.entity';
import { Repository } from 'typeorm';
import { InboundEmailAddress } from './inbound-email-address.entity';

export interface InboundEmailAddressView {
  businessNumber: string;
  businessName: string | null;
  address: string;
}

export interface InboundEmailTarget {
  firebaseId: string;
  businessNumber: string;
}

@Injectable()
export class InboundEmailAddressService {
  constructor(
    @InjectRepository(InboundEmailAddress)
    private readonly addressRepo: Repository<InboundEmailAddress>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

  async listForOwner(firebaseId: string): Promise<InboundEmailAddressView[]> {
    const businesses = await this.businessRepo.find({
      where: { firebaseId },
      order: { id: 'ASC' },
    });
    const usable = businesses.filter(
      (business): business is Business & { businessNumber: string } =>
        !!business.businessNumber?.trim(),
    );

    const result: InboundEmailAddressView[] = [];
    for (const business of usable) {
      const mailbox = await this.getOrCreate(firebaseId, business.businessNumber);
      result.push({
        businessNumber: business.businessNumber,
        businessName: business.businessName,
        address: this.toAddress(mailbox.localPart),
      });
    }
    return result;
  }

  async resolveRecipient(recipient: string): Promise<InboundEmailTarget> {
    const normalized = String(recipient ?? '').trim().toLowerCase();
    const at = normalized.lastIndexOf('@');
    if (at <= 0 || normalized.slice(at + 1) !== this.domain()) {
      throw new NotAcceptableException('Unknown inbound email domain');
    }

    const mailbox = await this.addressRepo.findOne({
      where: { localPart: normalized.slice(0, at), isActive: true },
    });
    if (!mailbox) {
      throw new NotAcceptableException('Unknown inbound email recipient');
    }
    return {
      firebaseId: mailbox.firebaseId,
      businessNumber: mailbox.businessNumber,
    };
  }

  private async getOrCreate(
    firebaseId: string,
    businessNumber: string,
  ): Promise<InboundEmailAddress> {
    const existing = await this.addressRepo.findOne({
      where: { firebaseId, businessNumber },
    });
    if (existing) return existing;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.addressRepo.save(
          this.addressRepo.create({
            firebaseId,
            businessNumber,
            localPart: `d-${randomBytes(12).toString('hex')}`,
            isActive: true,
          }),
        );
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        const raced = await this.addressRepo.findOne({
          where: { firebaseId, businessNumber },
        });
        if (raced) return raced;
      }
    }
    throw new InternalServerErrorException('Could not allocate inbound email address');
  }

  private toAddress(localPart: string): string {
    return `${localPart}@${this.domain()}`;
  }

  private domain(): string {
    const explicit = process.env.MAILGUN_INBOUND_DOMAIN?.trim().toLowerCase();
    if (explicit) return explicit;

    // Keeps the verified development spike usable while the deployment
    // configuration migrates to MAILGUN_INBOUND_DOMAIN.
    const spikeRecipient = process.env.MAILGUN_INBOUND_SPIKE_RECIPIENT?.trim();
    const at = spikeRecipient?.lastIndexOf('@') ?? -1;
    if (spikeRecipient && at > 0) {
      return spikeRecipient.slice(at + 1).toLowerCase();
    }
    throw new InternalServerErrorException('MAILGUN_INBOUND_DOMAIN is not configured');
  }
}
