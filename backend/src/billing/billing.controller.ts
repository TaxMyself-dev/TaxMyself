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
   * Public. Returns all active, public subscription plans sorted by displayOrder.
   */
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  /**
   * GET /billing/me
   *
   * Protected. Returns the current user's full billing state.
   * Returns a "no subscription" shape if the user has not started a trial yet.
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
   * Protected. Idempotent — creates a trial subscription if one does not exist.
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
   * Protected. Calculates the final price without creating a session or charging.
   * Body: { planId: number }
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
   * Protected. Calls CardCom LowProfile/Create and returns the hosted payment page URL.
   * Subscription activation happens exclusively via the CardCom webhook handler.
   *
   * Returns: { paymentUrl, finalAmountAgorot, currency }
   * Body: { planId: number }
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
