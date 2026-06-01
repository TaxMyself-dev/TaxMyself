import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promotion } from '../entities/promotion.entity';
import { PromotionPlan } from '../entities/promotion-plan.entity';

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepo: Repository<Promotion>,
    @InjectRepository(PromotionPlan)
    private readonly promotionPlanRepo: Repository<PromotionPlan>,
  ) {}

  /**
   * Finds the best active promotion that applies to the given plan.
   *
   * Active means:
   *   - isActive = true and not soft-deleted
   *   - current date is within [startsAt, endsAt] (open bounds if null)
   *   - global redemption limit not exceeded
   *
   * "Best" = highest priority value. Ties broken by id (lower id = older, wins).
   */
  async getBestActivePromotionForPlan(planId: number): Promise<Promotion | null> {
    const promotionPlans = await this.promotionPlanRepo.find({
      where: { planId },
    });

    if (promotionPlans.length === 0) return null;

    const promotionIds = promotionPlans.map((pp) => pp.promotionId);
    const now = new Date();

    const promotions = await this.promotionRepo
      .createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: promotionIds })
      .andWhere('p.isActive = :active', { active: true })
      .andWhere('p.deletedAt IS NULL')
      .andWhere('(p.startsAt IS NULL OR p.startsAt <= :now)', { now })
      .andWhere('(p.endsAt IS NULL OR p.endsAt >= :now)', { now })
      .andWhere(
        '(p.maxRedemptions IS NULL OR p.currentRedemptions < p.maxRedemptions)',
      )
      .orderBy('p.priority', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .getMany();

    return promotions[0] ?? null;
  }
}
