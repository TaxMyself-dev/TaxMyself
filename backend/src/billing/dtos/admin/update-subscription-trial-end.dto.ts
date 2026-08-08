import { IsDateString, IsOptional } from 'class-validator';

/** Admin override of a subscription's trial-end date, editable inline from the admin subscriptions table. */
export class UpdateSubscriptionTrialEndDto {
  /** ISO date string. Pass null to clear. */
  @IsOptional()
  @IsDateString()
  trialEnd?: string | null;
}
