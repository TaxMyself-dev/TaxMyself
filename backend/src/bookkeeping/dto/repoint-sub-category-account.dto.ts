import { IsNumber } from 'class-validator';

/** PATCH bookkeeping/sub-categories/:id/account (Phase 4.2 / D9) —
 *  repoint a sub_category's future mapping at a different card. */
export class RepointSubCategoryAccountDto {
  @IsNumber()
  accountId: number;
}
