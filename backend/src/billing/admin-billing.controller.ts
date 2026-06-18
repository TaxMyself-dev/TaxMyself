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

  // ─── Admin guard ────────────────────────────────────────────────────────────

  private async assertAdmin(request: AuthenticatedRequest): Promise<void> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) throw new ForbiddenException('גישה מותרת רק למנהל');
  }
}
