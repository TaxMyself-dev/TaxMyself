import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DelegationService } from './delegation.service';
import { SimpleRateLimitGuard } from '../guards/simple-rate-limit.guard';

/**
 * Public (unauthenticated) referral-link surface. Deliberately separate from
 * DelegationController — everything here is reachable with no Bearer token,
 * so it must never expose more than the accountant's display name.
 */
@Controller('referral')
export class ReferralController {
  constructor(private readonly delegationService: DelegationService) {}

  /**
   * GET /referral/:code/info — used by the register-page banner to show
   * "X מזמין/ה אותך להצטרף" before the visitor signs up. referralCode is a
   * high-entropy random slug (not guessable/enumerable), so this is
   * rate-limited only as basic scraping/DoS insurance, not as the primary
   * defense against enumeration.
   */
  @Get(':code/info')
  @UseGuards(SimpleRateLimitGuard({ windowMs: 60_000, max: 30 }))
  async getReferralInfo(@Param('code') code: string): Promise<{ accountantName: string }> {
    return this.delegationService.getReferralInfo(code);
  }
}
