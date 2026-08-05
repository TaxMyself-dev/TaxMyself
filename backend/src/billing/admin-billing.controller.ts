import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { UsersService } from 'src/users/users.service';
import { AdminBillingService } from './services/admin-billing.service';
import { CreatePlanDto } from './dtos/admin/create-plan.dto';
import { UpdatePlanDto } from './dtos/admin/update-plan.dto';
import { UpdateSubscriptionDiscountDto } from './dtos/admin/update-subscription-discount.dto';

@Controller('admin/billing')
@UseGuards(FirebaseAuthGuard)
export class AdminBillingController {
  constructor(
    private readonly adminBillingService: AdminBillingService,
    private readonly usersService: UsersService,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  @Get('plans')
  async getPlans(@Req() request: AuthenticatedRequest) {
    await this.assertAdmin(request);
    return this.adminBillingService.findAllPlans();
  }

  @Post('plans')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createPlan(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePlanDto,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.createPlan(dto);
  }

  @Patch('plans/:id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updatePlan(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.updatePlan(id, dto);
  }

  @Patch('plans/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivatePlan(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.deactivatePlan(id);
  }

  @Patch('plans/:id/activate')
  @HttpCode(HttpStatus.OK)
  async activatePlan(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.activatePlan(id);
  }

  // ─── Subscriptions ───────────────────────────────────────────────────────────

  @Get('subscriptions')
  async getSubscriptions(@Req() request: AuthenticatedRequest) {
    await this.assertAdmin(request);
    return this.adminBillingService.findAllSubscriptions();
  }

  @Patch('subscriptions/:id/discount')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateSubscriptionDiscount(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubscriptionDiscountDto,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.updateSubscriptionDiscount(id, dto);
  }

  /**
   * POST /admin/billing/subscriptions/:id/renew
   *
   * Manual test trigger for the monthly renewal flow — runs the exact same
   * row-locked charge-by-token logic the daily cron uses, for one subscription.
   * Safe to call on a subscription that isn't due yet (returns outcome:'skipped').
   */
  @Post('subscriptions/:id/renew')
  @HttpCode(HttpStatus.OK)
  async triggerSubscriptionRenewal(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.triggerSubscriptionRenewal(id);
  }

  /**
   * POST /admin/billing/renewals/run-due
   *
   * Manual test trigger for the full daily renewal batch — runs
   * SubscriptionRenewalService.processDueRenewals(), the exact same method the
   * 03:00 Asia/Jerusalem cron calls. Finds every subscription with
   * status=ACTIVE AND nextBillingDate<=NOW() and charges each one through the
   * same row-locked, idempotent flow. May trigger real CardCom charges.
   */
  @Post('renewals/run-due')
  @HttpCode(HttpStatus.OK)
  async runDueRenewals(@Req() request: AuthenticatedRequest) {
    await this.assertAdmin(request);
    return this.adminBillingService.triggerDueRenewalsRun();
  }

  // ─── Receipt failures (manual resolution) ────────────────────────────────────

  /**
   * GET /admin/billing/receipts/pending
   *
   * Lists every successful charge whose automatic receipt generation failed
   * and was never resolved. Each one blocks its subscription from further
   * payments (see BillingEventService.getUnresolvedReceiptFailure) until
   * resolved via POST .../:billingEventId/generate.
   */
  @Get('receipts/pending')
  async getPendingReceiptFailures(@Req() request: AuthenticatedRequest) {
    await this.assertAdmin(request);
    return this.adminBillingService.findPendingReceiptFailures();
  }

  /**
   * POST /admin/billing/receipts/:billingEventId/generate
   *
   * Manually runs the exact same receipt-creation pipeline the webhook/renewal
   * flows use automatically, for one specific failed charge event. On success
   * the subscription is immediately un-blocked from further payments.
   */
  @Post('receipts/:billingEventId/generate')
  @HttpCode(HttpStatus.OK)
  async generateReceiptForEvent(
    @Req() request: AuthenticatedRequest,
    @Param('billingEventId', ParseIntPipe) billingEventId: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.generateReceiptForEvent(billingEventId);
  }

  // ─── Admin guard ────────────────────────────────────────────────────────────

  private async assertAdmin(request: AuthenticatedRequest): Promise<void> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) throw new ForbiddenException('גישה מותרת רק למנהל');
  }
}
