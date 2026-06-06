import { Entity, PrimaryColumn } from 'typeorm';

/** Join table: which plans a coupon is valid for. */
@Entity('coupon_plan')
export class CouponPlan {
  @PrimaryColumn({ name: 'coupon_id', type: 'int' })
  couponId: number;

  @PrimaryColumn({ name: 'plan_id', type: 'int' })
  planId: number;
}
