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
import { CreatePromotionDto } from './dtos/admin/create-promotion.dto';
import { UpdatePromotionDto } from './dtos/admin/update-promotion.dto';
import { CreateCouponDto } from './dtos/admin/create-coupon.dto';
import { UpdateCouponDto } from './dtos/admin/update-coupon.dto';
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

  // ─── Promotions ─────────────────────────────────────────────────────────────

  @Get('promotions')
  async getPromotions(@Req() request: AuthenticatedRequest) {
    await this.assertAdmin(request);
    return this.adminBillingService.findAllPromotions();
  }

  @Post('promotions')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createPromotion(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePromotionDto,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.createPromotion(dto);
  }

  @Patch('promotions/:id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updatePromotion(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromotionDto,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.updatePromotion(id, dto);
  }

  @Patch('promotions/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivatePromotion(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.deactivatePromotion(id);
  }

  @Patch('promotions/:id/activate')
  @HttpCode(HttpStatus.OK)
  async activatePromotion(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.activatePromotion(id);
  }

  // ─── Coupons ─────────────────────────────────────────────────────────────────

  @Get('coupons')
  async getCoupons(@Req() request: AuthenticatedRequest) {
    await this.assertAdmin(request);
    return this.adminBillingService.findAllCoupons();
  }

  @Post('coupons')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createCoupon(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCouponDto,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.createCoupon(dto);
  }

  @Patch('coupons/:id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateCoupon(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCouponDto,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.updateCoupon(id, dto);
  }

  @Patch('coupons/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateCoupon(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.deactivateCoupon(id);
  }

  @Patch('coupons/:id/activate')
  @HttpCode(HttpStatus.OK)
  async activateCoupon(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertAdmin(request);
    return this.adminBillingService.activateCoupon(id);
  }

  // ─── Admin guard ────────────────────────────────────────────────────────────

  private async assertAdmin(request: AuthenticatedRequest): Promise<void> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) throw new ForbiddenException('גישה מותרת רק למנהל');
  }
}
