import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
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
   * Protected. Returns all active, public subscription plans sorted by
   * displayOrder, each annotated with the price effective for the
   * authenticated user's billing business type (see PricingService).
   */
  @Get('plans')
  @UseGuards(FirebaseAuthGuard)
  getPlans(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.getPlans(firebaseId);
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

  /**
   * POST /billing/change-payment-method
   *
   * Protected. Starts the "replace saved card" flow. Creates a CardCom LowProfile
   * with Operation=CreateTokenOnly (J2) — a NEW token is created WITHOUT charging.
   * No request body; the subscription is resolved from the authenticated user.
   *
   * Allowed only for ACTIVE / PAST_DUE subscriptions. Returns
   * { paymentUrl, lowProfileId } — both refer to the SAME LowProfile deal:
   * lowProfileId initializes the embedded Open Fields dialog, paymentUrl is the
   * hosted-page redirect kept as fallback. The saved payment_method is updated
   * later via the CardCom webhook.
   */
  @Post('change-payment-method')
  @UseGuards(FirebaseAuthGuard)
  changePaymentMethod(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.changePaymentMethod(firebaseId);
  }

  /**
   * GET /billing/change-payment-method/status?lowProfileId=…
   *
   * Protected. Terminal state of ONE change-payment-method attempt, addressed by
   * the LowProfileId returned from POST /billing/change-payment-method.
   *
   * Returns { lowProfileId, status: PENDING|SUCCESS|FAILED, last4, brand,
   * failureReason, reconciled }. 404 if the LowProfileId is unknown or belongs
   * to another user.
   *
   * Safe to poll: PENDING is side-effect-free until the attempt has gone
   * unanswered past the reconciliation threshold, at which point this pulls the
   * result from CardCom itself (idempotently — see
   * CardcomWebhookService.reconcileChangePaymentMethod).
   */
  @Get('change-payment-method/status')
  @UseGuards(FirebaseAuthGuard)
  getChangePaymentMethodStatus(
    @Req() request: AuthenticatedRequest,
    @Query('lowProfileId') lowProfileId: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    if (!lowProfileId || typeof lowProfileId !== 'string') {
      throw new BadRequestException('lowProfileId is required');
    }
    return this.billingService.getChangePaymentMethodStatus(firebaseId, lowProfileId);
  }

  /**
   * GET /billing/payments
   *
   * Protected. Returns the authenticated user's payment history (successful and
   * failed payments/renewals), newest first, for the "My Subscription" tab.
   */
  @Get('payments')
  @UseGuards(FirebaseAuthGuard)
  getPaymentHistory(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.getUserPaymentHistory(firebaseId);
  }

  /**
   * GET /billing/payments/:eventId/receipt
   *
   * Protected. Streams the receipt PDF for a payment event the user owns.
   * Reuses DocumentsService.getBillingReceiptPdf — no new download logic.
   */
  @Get('payments/:eventId/receipt')
  @UseGuards(FirebaseAuthGuard)
  async downloadReceipt(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Res() res: Response,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const receipt = await this.billingService.getPaymentReceiptPdf(firebaseId, eventId);
    const fileName = `${receipt.docType}_${receipt.docNumber}_${receipt.generalDocIndex}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(receipt.buffer);
  }

  /**
   * POST /billing/events/:eventId/receipt/resend-email
   *
   * Protected. Re-sends the receipt email for a PAYMENT_SUCCESS event that
   * the authenticated user owns. Reuses the existing Firebase PDF — no
   * regeneration. Returns { sent, error? }.
   *
   * Frontend: show [שלח שוב] when receiptDocId != null && receiptEmailSent === false.
   */
  @Post('events/:eventId/receipt/resend-email')
  @UseGuards(FirebaseAuthGuard)
  resendReceiptEmail(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.resendReceiptEmail(firebaseId, eventId);
  }

  /**
   * POST /billing/events/:eventId/receipt/generate
   *
   * Protected. Generates the missing receipt for a PAYMENT_SUCCESS event whose
   * document was never created (INVOICE_FAILED case). Idempotent: if a receipt
   * document already exists for the event, skips creation and only resends the
   * email. Never creates a duplicate document.
   *
   * Returns { created, sent, error? }.
   *
   * Frontend: show [הפק חשבונית] when receiptDocId == null && receiptFailed === true.
   */
  @Post('events/:eventId/receipt/generate')
  @UseGuards(FirebaseAuthGuard)
  generateMissingReceipt(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');
    return this.billingService.generateMissingReceipt(firebaseId, eventId);
  }

}
