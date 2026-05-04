import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Business } from './business.entity';
import { Repository } from 'typeorm';


@Injectable()
export class BusinessService {

  constructor(
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
  ) { }


  // Fetch all businesses that belong to a specific user (by firebaseId)
  async getUserBusinesses(firebaseId: string): Promise<Business[]> {
    
    if (!firebaseId) {
      throw new Error('Firebase ID is missing in request');
    }

    // Fetch all businesses for this user
    const businesses = await this.businessRepo.find({
      where: { firebaseId },
      order: { id: 'ASC' },
    });
    
    return businesses;
  }


  async getBusinessByNumber(businessNumber: string, firebaseId?: string): Promise<Business | null> {
    const where: any = { businessNumber };
    if (firebaseId) {
      where.firebaseId = firebaseId;
    }
    
    return await this.businessRepo.findOne({ where });
  }

  async updateBusiness(
    firebaseId: string,
    dto: { id?: number; businessNumber?: string; advanceTaxPercent?: number; businessName?: string; businessAddress?: string; businessPhone?: string; businessEmail?: string; businessType?: string },
  ): Promise<Business> {
    let business: Business | null;
    if (dto.id != null) {
      business = await this.businessRepo.findOne({ where: { id: dto.id, firebaseId } });
    } else if (dto.businessNumber != null && dto.businessNumber !== '') {
      business = await this.businessRepo.findOne({ where: { businessNumber: dto.businessNumber, firebaseId } });
    } else {
      throw new NotFoundException('Business id or businessNumber is required');
    }
    if (!business) {
      throw new NotFoundException('Business not found or not owned by user');
    }
    if (dto.advanceTaxPercent !== undefined) business.advanceTaxPercent = dto.advanceTaxPercent;
    if (dto.businessName !== undefined) business.businessName = dto.businessName;
    if (dto.businessAddress !== undefined) business.businessAddress = dto.businessAddress;
    if (dto.businessPhone !== undefined) business.businessPhone = dto.businessPhone;
    if (dto.businessEmail !== undefined) business.businessEmail = dto.businessEmail;
    if (dto.businessType !== undefined) business.businessType = dto.businessType as any;
    if ((dto as any).vatReportingType !== undefined) business.vatReportingType = (dto as any).vatReportingType;
    if ((dto as any).taxReportingType !== undefined) business.taxReportingType = (dto as any).taxReportingType;
    if ((dto as any).nationalInsRequired !== undefined) business.nationalInsRequired = (dto as any).nationalInsRequired;
    return this.businessRepo.save(business);
  }

  async createBusiness(
    firebaseId: string,
    dto?: {
      businessName?: string;
      businessNumber?: string;
      businessAddress?: string;
      businessPhone?: string;
      businessEmail?: string;
      businessType?: string;
      advanceTaxPercent?: number;
    },
  ): Promise<Business> {
    const business = this.businessRepo.create({
      firebaseId,
      businessName: dto?.businessName ?? null,
      businessNumber: dto?.businessNumber ?? null,
      businessAddress: dto?.businessAddress ?? null,
      businessPhone: dto?.businessPhone ?? null,
      businessEmail: dto?.businessEmail ?? null,
      businessType: (dto?.businessType as any) ?? null,
      advanceTaxPercent: dto?.advanceTaxPercent ?? null,
    });
    return this.businessRepo.save(business);
  }

  async deleteBusiness(firebaseId: string, id: number): Promise<void> {
    const business = await this.businessRepo.findOne({ where: { id, firebaseId } });
    if (!business) {
      throw new NotFoundException('Business not found or not owned by user');
    }
    await this.businessRepo.remove(business);
  }

}