import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/user.entity';
import { BusinessType } from 'src/enum';
import { DocumentsService } from 'src/documents/documents.service';

@Injectable()
export class BillingReceiptService implements OnModuleInit {
  private readonly logger = new Logger(BillingReceiptService.name);

  private systemUserId: string;
  private issuerBusinessNumber: string;
  private issuerBusinessType: BusinessType;
  private initialReceiptIndex: number;

  constructor(
    private readonly documentsService: DocumentsService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  onModuleInit(): void {
    const systemUserId = process.env.COMPANY_BILLING_FIREBASE_ID;
    const issuerBusinessNumber = process.env.COMPANY_BILLING_BUSINESS_NUMBER;

    const missing = [
      !systemUserId && 'COMPANY_BILLING_FIREBASE_ID',
      !issuerBusinessNumber && 'COMPANY_BILLING_BUSINESS_NUMBER',
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(
        `BillingReceiptService: missing required env vars: ${missing.join(', ')}`,
      );
    }

    this.systemUserId = systemUserId!;
    this.issuerBusinessNumber = issuerBusinessNumber!;
    this.issuerBusinessType =
      (process.env.COMPANY_BILLING_BUSINESS_TYPE as BusinessType) ?? BusinessType.COMPANY;
    this.initialReceiptIndex = parseInt(
      process.env.COMPANY_BILLING_RECEIPT_INITIAL_INDEX ?? '1',
      10,
    );
  }

  async createReceiptForPayment(params: {
    firebaseId: string;
    subscriptionId: number;
    amountBeforeVatAgorot: number;
    vatAmountAgorot: number;
    amountIncludingVatAgorot: number;
    planName: string;
    cardcomDealNumber: string | null;
  }): Promise<{ receiptDocId: number; docNumber: string; generalDocIndex: string }> {
    const {
      firebaseId, subscriptionId,
      amountBeforeVatAgorot, vatAmountAgorot, amountIncludingVatAgorot,
      planName, cardcomDealNumber,
    } = params;

    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user) {
      throw new Error(
        `BillingReceiptService: user not found for firebaseId=${firebaseId}`,
      );
    }

    const recipientName = `${user.fName ?? ''} ${user.lName ?? ''}`.trim() || 'לקוח';
    const recipientEmail = user.email ?? null;

    const result = await this.documentsService.createBillingSystemReceipt({
      systemUserId: this.systemUserId,
      issuerBusinessNumber: this.issuerBusinessNumber,
      issuerBusinessType: this.issuerBusinessType,
      recipientName,
      recipientEmail,
      amountBeforeVatAgorot,
      vatAmountAgorot,
      amountIncludingVatAgorot,
      planName,
      docDate: new Date(),
      initialReceiptIndex: this.initialReceiptIndex,
    });

    this.logger.log(
      `Billing receipt created: docId=${result.receiptDocId} docNumber=${result.docNumber} ` +
        `for firebaseId=${firebaseId} subscriptionId=${subscriptionId} ` +
        `dealNumber=${cardcomDealNumber ?? 'null'}`,
    );

    return result;
  }
}
