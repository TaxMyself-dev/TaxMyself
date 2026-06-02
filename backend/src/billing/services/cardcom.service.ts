import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface CardcomLowProfileInput {
  checkoutSessionId: number;
  firebaseId: string;
  amountAgorot: number;
  planName: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
}

export interface CardcomLowProfileResult {
  lowProfileId: string;
  paymentUrl: string;
  rawResponse: Record<string, any>;
}

export class CardcomApiError extends Error {
  constructor(
    message: string,
    public readonly responseCode?: number,
    public readonly cardcomDescription?: string,
    public readonly rawResponse?: Record<string, any>,
  ) {
    super(message);
    this.name = 'CardcomApiError';
  }
}

/**
 * Thin wrapper around the CardCom LowProfile API (v11).
 * All CardCom-specific knowledge lives here — BillingService never touches
 * raw CardCom payloads or field names.
 *
 * Field names are verified against the official CardCom OpenAPI spec v11.
 * CreateLowProfile has additionalProperties:false, so any unknown field
 * causes a 400 from CardCom.
 *
 * ApiPassword is intentionally NOT included in LowProfile/Create requests —
 * it is not part of the CreateLowProfile schema and would cause a 400.
 * It is stored separately for future use by Refund and Document endpoints.
 */
@Injectable()
export class CardcomService implements OnModuleInit {
  private readonly logger = new Logger(CardcomService.name);

  private static readonly DEFAULT_CREATE_URL =
    'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

  private terminalNumber!: string;
  private apiName!: string;
  /** Stored for Refund/Documents endpoints — never sent to LowProfile/Create. */
  private apiPassword!: string;
  private createUrl!: string;
  private successUrl!: string;
  private failedUrl!: string;
  private webhookUrl!: string;

  constructor(private readonly http: HttpService) {}

  /**
   * Validates all required CardCom env vars at startup.
   * The app will not start if any are missing.
   */
  onModuleInit(): void {
    const required: Record<string, string | undefined> = {
      CARDCOM_TERMINAL_NUMBER: process.env.CARDCOM_TERMINAL_NUMBER,
      CARDCOM_API_NAME: process.env.CARDCOM_API_NAME,
      CARDCOM_API_PASSWORD: process.env.CARDCOM_API_PASSWORD,
      CARDCOM_SUCCESS_URL: process.env.CARDCOM_SUCCESS_URL,
      CARDCOM_FAILED_URL: process.env.CARDCOM_FAILED_URL,
      CARDCOM_WEBHOOK_URL: process.env.CARDCOM_WEBHOOK_URL,
    };

    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length > 0) {
      throw new Error(
        `CardcomService: missing required environment variables: ${missing.join(', ')}`,
      );
    }

    this.terminalNumber = required.CARDCOM_TERMINAL_NUMBER!;
    this.apiName = required.CARDCOM_API_NAME!;
    this.apiPassword = required.CARDCOM_API_PASSWORD!;
    this.successUrl = required.CARDCOM_SUCCESS_URL!;
    this.failedUrl = required.CARDCOM_FAILED_URL!;
    this.webhookUrl = required.CARDCOM_WEBHOOK_URL!;
    this.createUrl =
      process.env.CARDCOM_LOW_PROFILE_CREATE_URL ?? CardcomService.DEFAULT_CREATE_URL;

    this.logger.log(
      `CardCom configured: terminal=***${this.terminalNumber.slice(-4)} ` +
        `apiName=${this.apiName} url=${this.createUrl}`,
    );
  }

  async createLowProfileCheckout(
    input: CardcomLowProfileInput,
  ): Promise<CardcomLowProfileResult> {
    // CardCom expects amount in NIS (decimal shekels). We store in integer agorot.
    const amountNis = input.amountAgorot / 100;

    // Fix 3: TerminalNumber is typed as integer in the CreateLowProfile schema.
    const terminalNumberInt = parseInt(this.terminalNumber, 10);

    const payload: Record<string, any> = {
      // ── Required fields ────────────────────────────────────────────────────
      TerminalNumber: terminalNumberInt,
      ApiName: this.apiName,
      // ApiPassword is NOT part of CreateLowProfile (additionalProperties:false).
      // Sending it would cause a 400. It is used only by Refund/Document endpoints.
      Amount: amountNis,
      // Fix 6: FailedRedirectUrl is the documented required field name.
      SuccessRedirectUrl: this.successUrl,
      FailedRedirectUrl: this.failedUrl,
      WebHookUrl: this.webhookUrl,

      // ── Optional top-level fields ──────────────────────────────────────────
      ProductName: input.planName,
      // ReturnValue is echoed back in webhook + redirect URLs.
      // Used as idempotency key: maps CardCom callback back to our session.
      ReturnValue: String(input.checkoutSessionId),
      // Fix 4: ISOCoinId is the documented field name (not CoinID). 1 = ILS.
      ISOCoinId: 1,
      // Fix 5: Operation enum replaces non-existent TokenizationMode.
      // ChargeAndCreateToken charges the card and returns a token for recurring billing.
      Operation: 'ChargeAndCreateToken',
    };

    // Fix 7: Customer fields are not top-level. They go inside UIDefinition.
    const uiDefinition: Record<string, string> = {};
    if (input.customerEmail) uiDefinition['CardOwnerEmailValue'] = input.customerEmail;
    if (input.customerName) uiDefinition['CardOwnerNameValue'] = input.customerName;
    if (input.customerPhone) uiDefinition['CardOwnerPhoneValue'] = input.customerPhone;
    if (Object.keys(uiDefinition).length > 0) {
      payload['UIDefinition'] = uiDefinition;
    }

    // Log safe fields only — credentials and customer PII never appear here.
    this.logger.log(
      `CardCom LowProfile/Create → sessionId=${input.checkoutSessionId} ` +
        `amount=${amountNis} NIS terminal=***${this.terminalNumber.slice(-4)}`,
    );

    let rawResponse: Record<string, any>;

    try {
      const response = await firstValueFrom(
        this.http.post<Record<string, any>>(this.createUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30_000,
        }),
      );
      rawResponse = response.data ?? {};
    } catch (err: any) {
      const detail: string = err?.response?.data
        ? JSON.stringify(err.response.data).slice(0, 500)
        : (err?.message ?? 'HTTP request failed');
      this.logger.error(
        `CardCom HTTP error for session ${input.checkoutSessionId}: ${detail}`,
      );
      throw new CardcomApiError(`CardCom HTTP request failed: ${detail}`);
    }

    // Response field names verified against CreateLowProfileResponse schema (PascalCase only).
    const responseCode: number = rawResponse['ResponseCode'] ?? -1;
    const description: string = rawResponse['Description'] ?? '';
    const lowProfileId: string = rawResponse['LowProfileId'] ?? '';
    const paymentUrl: string = rawResponse['Url'] ?? '';

    if (responseCode !== 0) {
      this.logger.error(
        `CardCom rejected session ${input.checkoutSessionId}: code=${responseCode} desc=${description}`,
      );
      throw new CardcomApiError(
        `CardCom error (code ${responseCode}): ${description || 'Unknown error'}`,
        responseCode,
        description,
        rawResponse,
      );
    }

    if (!lowProfileId) {
      throw new CardcomApiError(
        'CardCom returned success but LowProfileId is missing',
        responseCode,
        description,
        rawResponse,
      );
    }

    if (!paymentUrl) {
      throw new CardcomApiError(
        'CardCom returned success but payment URL (Url) is missing',
        responseCode,
        description,
        rawResponse,
      );
    }

    this.logger.log(
      `CardCom LowProfile created: sessionId=${input.checkoutSessionId} lowProfileId=${lowProfileId}`,
    );

    return { lowProfileId, paymentUrl, rawResponse };
  }

  /**
   * Calls CardCom LowProfile/GetLpResult to independently verify a payment.
   * Used by the webhook handler to confirm the charge before activating the subscription.
   *
   * Request schema (GetLowProfileResult): TerminalNumber, ApiName, LowProfileId.
   * No ApiPassword required (verified against Swagger v11).
   * Response schema: LowProfileResult — same shape as the webhook payload.
   */
  async getLowProfileResult(lowProfileId: string): Promise<Record<string, any>> {
    const resultUrl =
      process.env.CARDCOM_LOW_PROFILE_RESULT_URL ??
      'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult';

    const payload = {
      TerminalNumber: parseInt(this.terminalNumber, 10),
      ApiName: this.apiName,
      LowProfileId: lowProfileId,
    };

    this.logger.log(`CardCom GetLpResult → lowProfileId=${lowProfileId}`);

    try {
      const response = await firstValueFrom(
        this.http.post<Record<string, any>>(resultUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30_000,
        }),
      );
      return response.data ?? {};
    } catch (err: any) {
      const detail: string = err?.response?.data
        ? JSON.stringify(err.response.data).slice(0, 500)
        : (err?.message ?? 'HTTP request failed');
      this.logger.error(`CardCom GetLpResult HTTP error for ${lowProfileId}: ${detail}`);
      throw new CardcomApiError(`CardCom GetLpResult failed: ${detail}`);
    }
  }

  /**
   * Exposes credentials for future CardCom endpoints that require ApiPassword
   * (Refund, Documents). Never call from the checkout flow.
   */
  getApiCredentials(): { apiName: string; apiPassword: string; terminalNumber: number } {
    return {
      apiName: this.apiName,
      apiPassword: this.apiPassword,
      terminalNumber: parseInt(this.terminalNumber, 10),
    };
  }
}
