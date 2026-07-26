import { Injectable, OnModuleInit } from '@nestjs/common';
import { BusinessService } from 'src/business/business.service';
import { ReceiptIssuer } from './billing-receipt.service';

/**
 * Resolves the ReceiptIssuer for Keepintax's own subscription billing.
 * Only the two identity fields (firebaseId, businessNumber) are configured —
 * everything else (name, phone, email, address, business type) is derived
 * fresh from the Business record, never hardcoded. This is the one place
 * that still reads COMPANY_BILLING_* env vars — the intended seam for later:
 * when other businesses can charge via CardCom, only the call site that
 * decides which (firebaseId, businessNumber) pair to resolve (currently
 * always this one, from CardcomWebhookService.generateReceiptAfterPayment())
 * needs to change, not BillingReceiptService itself.
 */
@Injectable()
export class BillingIssuerConfigService implements OnModuleInit {
  private systemUserId: string;
  private issuerBusinessNumber: string;

  constructor(private readonly businessService: BusinessService) {}

  onModuleInit(): void {
    const systemUserId = process.env.COMPANY_BILLING_FIREBASE_ID;
    const issuerBusinessNumber = process.env.COMPANY_BILLING_BUSINESS_NUMBER;

    const missing = [
      !systemUserId && 'COMPANY_BILLING_FIREBASE_ID',
      !issuerBusinessNumber && 'COMPANY_BILLING_BUSINESS_NUMBER',
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(
        `BillingIssuerConfigService: missing required env vars: ${missing.join(', ')}`,
      );
    }

    this.systemUserId = systemUserId!;
    this.issuerBusinessNumber = issuerBusinessNumber!;
  }

  async getKeepintaxIssuer(): Promise<ReceiptIssuer> {
    const business = await this.businessService.getBusinessByNumber(
      this.issuerBusinessNumber,
      this.systemUserId,
    );

    if (!business) {
      throw new Error(
        `BillingIssuerConfigService: no Business found for businessNumber=${this.issuerBusinessNumber} ` +
          `firebaseId=${this.systemUserId} — cannot resolve issuer identity`,
      );
    }
    if (!business.businessName || !business.businessType) {
      throw new Error(
        `BillingIssuerConfigService: Business id=${business.id} (businessNumber=${this.issuerBusinessNumber}) ` +
          `is missing businessName/businessType — cannot issue a receipt for it`,
      );
    }

    return {
      systemUserId: this.systemUserId,
      issuerBusinessNumber: this.issuerBusinessNumber,
      issuerBusinessType: business.businessType,
      issuerName: business.businessName,
      issuerPhone: business.businessPhone,
      issuerEmail: business.businessEmail,
      issuerAddress: business.businessAddress,
    };
  }
}
