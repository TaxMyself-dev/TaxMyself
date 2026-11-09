import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../business/business.entity';
import { User } from '../../users/user.entity';
import { BillingPayerProfile } from '../entities/billing-payer-profile.entity';
import { Subscription } from '../entities/subscription.entity';
import { UpdateBillingPayerProfileDto } from '../dtos/billing-payer-profile.dto';

export interface BillingPayerSnapshot {
  fullName: string | null;
  identityNumber: string | null;
  email: string | null;
  phone: string | null;
  businessNumber: string | null;
}

@Injectable()
export class BillingPayerProfileService {
  constructor(
    @InjectRepository(BillingPayerProfile)
    private readonly profiles: Repository<BillingPayerProfile>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Business) private readonly businesses: Repository<Business>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
  ) {}

  async getForOwner(firebaseId: string): Promise<BillingPayerProfile> {
    const subscription = await this.subscriptions.findOne({ where: { firebaseId } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return this.ensureDraft(subscription.id, firebaseId);
  }

  async updateForOwner(
    firebaseId: string,
    dto: UpdateBillingPayerProfileDto,
  ): Promise<BillingPayerProfile> {
    const profile = await this.getForOwner(firebaseId);
    profile.fullName = clean(dto.fullName, 255);
    profile.identityNumber = clean(dto.identityNumber, 32);
    profile.email = clean(dto.email, 255);
    profile.phone = clean(dto.phone, 32);
    profile.businessNumber = clean(dto.businessNumber, 32);
    profile.version += 1;
    return this.profiles.save(profile);
  }

  async ensureDraft(subscriptionId: number, firebaseId: string): Promise<BillingPayerProfile> {
    const existing = await this.profiles.findOne({ where: { subscriptionId } });
    if (existing) return existing;
    const [user, business] = await Promise.all([
      this.users.findOne({ where: { firebaseId } }),
      this.businesses.findOne({ where: { firebaseId }, order: { id: 'ASC' } }),
    ]);
    const fullName = [user?.fName, user?.lName].filter(Boolean).join(' ').trim() ||
      business?.businessName?.trim() || null;
    const candidate = this.profiles.create({
      subscriptionId,
      fullName: clean(fullName, 255),
      identityNumber: clean(user?.id || business?.businessNumber, 32),
      email: clean(business?.businessEmail || user?.email, 255),
      phone: clean(business?.businessPhone || user?.phone, 32),
      businessNumber: clean(business?.businessNumber, 32),
      version: 1,
      verifiedAt: null,
    });
    try {
      return await this.profiles.save(candidate);
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      return this.profiles.findOneByOrFail({ subscriptionId });
    }
  }

  async saveVerified(
    subscriptionId: number,
    values: Record<string, any> | null | undefined,
  ): Promise<void> {
    if (!values) return;
    const profile = await this.profiles.findOne({ where: { subscriptionId } });
    if (!profile) return;
    const customFields = Array.isArray(values.CustomFields) ? values.CustomFields : [];
    const businessNumber = customFields.find((field: any) => Number(field?.Id) === 1)?.Value;
    profile.fullName = clean(values.CardOwnerName, 255) ?? profile.fullName;
    profile.identityNumber = clean(values.CardOwnerIdentityNumber, 32) ?? profile.identityNumber;
    profile.email = clean(values.CardOwnerEmail, 255) ?? profile.email;
    profile.phone = clean(values.CardOwnerPhone, 32) ?? profile.phone;
    profile.businessNumber = clean(businessNumber, 32) ?? profile.businessNumber;
    profile.version += 1;
    profile.verifiedAt = new Date();
    await this.profiles.save(profile);
  }
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result ? result.slice(0, maxLength) : null;
}
