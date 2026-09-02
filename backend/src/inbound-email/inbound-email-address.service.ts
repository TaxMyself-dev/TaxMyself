import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotAcceptableException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Business } from 'src/business/business.entity';
import { Repository } from 'typeorm';
import { InboundEmailAddress } from './inbound-email-address.entity';

export interface InboundEmailAddressView {
  businessNumber: string;
  businessName: string | null;
  domain: string;
  address: string | null;
  localPart: string | null;
  suggestedLocalPart: string;
  isLegacyGenerated: boolean;
}

export interface InboundEmailTarget {
  firebaseId: string;
  businessNumber: string;
}

@Injectable()
export class InboundEmailAddressService {
  private static readonly LEGACY_LOCAL_PART = /^d-[0-9a-f]{24}$/;
  private static readonly RESERVED_LOCAL_PARTS = new Set([
    'abuse',
    'admin',
    'billing',
    'contact',
    'help',
    'info',
    'mailer-daemon',
    'postmaster',
    'security',
    'spike',
    'support',
  ]);

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
      const mailbox = await this.addressRepo.findOne({
        where: { firebaseId, businessNumber: business.businessNumber },
      });
      const suggestedLocalPart = this.slugify(business.businessName ?? '');
      const allocated = mailbox ?? await this.claimSuggestionIfAvailable(
        firebaseId,
        business.businessNumber,
        suggestedLocalPart,
      );
      result.push(this.toView(business, allocated, suggestedLocalPart));
    }
    return result;
  }

  async updateForOwner(
    firebaseId: string,
    businessNumber: string,
    requestedLocalPart: string,
  ): Promise<InboundEmailAddressView> {
    const business = await this.businessRepo.findOne({
      where: { firebaseId, businessNumber },
    });
    if (!business?.businessNumber) {
      throw new NotFoundException('Business not found');
    }

    const localPart = String(requestedLocalPart ?? '').trim().toLowerCase();
    this.assertFriendlyLocalPart(localPart);

    let mailbox = await this.addressRepo.findOne({
      where: { firebaseId, businessNumber },
    });
    if (mailbox?.localPart === localPart) {
      return this.toView(business, mailbox, this.slugify(business.businessName ?? ''));
    }

    const occupied = await this.addressRepo.findOne({ where: { localPart } });
    if (occupied && occupied.id !== mailbox?.id) {
      throw new ConflictException('This inbound email address is already taken');
    }

    try {
      mailbox = await this.addressRepo.save(
        mailbox
          ? Object.assign(mailbox, { localPart, isActive: true })
          : this.addressRepo.create({
              firebaseId,
              businessNumber,
              localPart,
              isActive: true,
            }),
      );
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('This inbound email address is already taken');
      }
      throw error;
    }

    return this.toView(
      business,
      mailbox,
      this.slugify(business.businessName ?? ''),
    );
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

  private async claimSuggestionIfAvailable(
    firebaseId: string,
    businessNumber: string,
    suggestedLocalPart: string,
  ): Promise<InboundEmailAddress | null> {
    if (!suggestedLocalPart || this.isReserved(suggestedLocalPart)) return null;
    const occupied = await this.addressRepo.findOne({
      where: { localPart: suggestedLocalPart },
    });
    if (occupied) return null;

    try {
      return await this.addressRepo.save(
        this.addressRepo.create({
          firebaseId,
          businessNumber,
          localPart: suggestedLocalPart,
          isActive: true,
        }),
      );
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return this.addressRepo.findOne({
          where: { firebaseId, businessNumber },
        });
      }
      throw error;
    }
  }

  private toView(
    business: Pick<Business, 'businessNumber' | 'businessName'>,
    mailbox: InboundEmailAddress | null,
    suggestedLocalPart: string,
  ): InboundEmailAddressView {
    return {
      businessNumber: business.businessNumber!,
      businessName: business.businessName,
      domain: this.domain(),
      address: mailbox ? this.toAddress(mailbox.localPart) : null,
      localPart: mailbox?.localPart ?? null,
      suggestedLocalPart,
      isLegacyGenerated: !!mailbox && InboundEmailAddressService.LEGACY_LOCAL_PART.test(mailbox.localPart),
    };
  }

  private assertFriendlyLocalPart(localPart: string): void {
    if (
      localPart.length < 3 ||
      localPart.length > 50 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(localPart)
    ) {
      throw new BadRequestException(
        'Email name must be 3-50 lowercase English letters, numbers or hyphen-separated words',
      );
    }
    if (this.isReserved(localPart)) {
      throw new ConflictException('This inbound email address is reserved');
    }
  }

  private isReserved(localPart: string): boolean {
    return InboundEmailAddressService.RESERVED_LOCAL_PARTS.has(localPart);
  }

  private slugify(value: string): string {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/g, '');
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
