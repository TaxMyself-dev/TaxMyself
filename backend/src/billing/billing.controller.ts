import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { BillingService } from './services/billing.service';
import { CheckoutPreviewDto } from './dtos/checkout-preview.dto';
import { CreateCheckoutDto } from './dtos/create-checkout.dto';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * GET /billing/plans
   *
   * Public — no auth required. Returns all active, public subscription plans
   * sorted by displayOrder. Soft-deleted plans are excluded automatically.
   */
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  /**
   * GET /billing/me
   *
   * Protected. Returns the current user's full billing state:
   * subscription status, trial dates, plan details, module access flags.
   * Returns a clear "no subscription" shape if the user has not called
   * POST /billing/trial yet — frontend should show a "Start Trial" CTA.
   */
  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getMyBillingState(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.getMyBillingState(firebaseId);
  }

  /**
   * POST /billing/trial
   *
   * Protected. Idempotent — creates a trial subscription for the current user
   * if one does not exist yet. If one already exists, returns it unchanged.
   *
   * Also syncs legacy User fields (payStatus, modulesAccess, subscriptionEndDate)
   * to keep the existing SubscriptionGuard working during the migration period.
   */
  @Post('trial')
  @UseGuards(FirebaseAuthGuard)
  async ensureTrial(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.ensureTrialSubscription(firebaseId);
  }

  /**
   * POST /billing/checkout/preview
   *
   * Protected. Calculates the final price for a plan + optional coupon without
   * creating any session or charging anything. Safe to call multiple times.
   *
   * Body: { planId: number, couponCode?: string }
   */
  @Post('checkout/preview')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  previewCheckout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CheckoutPreviewDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.previewCheckout(firebaseId, dto);
  }

  /**
   * POST /billing/checkout
   *
   * Protected. Creates a PENDING cardcom_checkout_session and logs a
   * CHECKOUT_CREATED billing event.
   *
   * The subscription must already exist (call POST /billing/trial first).
   *
   * TODO: CardCom LowProfile creation will be wired here in the next step.
   *       The response will then include `cardcomCheckoutUrl` for the frontend
   *       to redirect the user to the hosted payment page.
   *
   * Body: { planId: number, couponCode?: string }
   */
  @Post('checkout')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCheckoutDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.createCheckout(firebaseId, dto);
  }
}
