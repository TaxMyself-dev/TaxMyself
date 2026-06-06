import { Entity, PrimaryColumn } from 'typeorm';

/** Join table: which plans a promotion applies to. */
@Entity('promotion_plan')
export class PromotionPlan {
  @PrimaryColumn({ name: 'promotion_id', type: 'int' })
  promotionId: number;

  @PrimaryColumn({ name: 'plan_id', type: 'int' })
  planId: number;
}
