import { Injectable } from '@nestjs/common';
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
      where.firebaseId = firebaseId; // Optional: ensure user owns the business
    }
    
    return await this.businessRepo.findOne({ where });
  }

}