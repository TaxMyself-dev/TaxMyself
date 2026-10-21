import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { getShaamUrls, REQUEST_TIMEOUT_MS } from '../shaam.constants';
import { ShaamApprovalDto } from '../dto/shaam-approval.dto';
import { ShaamApprovalResponseDto } from '../dto/shaam-approval-response.dto';
import {
  ShaamConfirmationLookupDto,
  ShaamInvoiceDetailsResponseDto,
} from '../dto/shaam-document-allocation.dto';

@Injectable()
export class ShaamInvoicesService {
  private readonly logger = new Logger(ShaamInvoicesService.name);
  private readonly urls: ReturnType<typeof getShaamUrls>;

  constructor(private readonly httpService: HttpService) {
    const env = process.env.SHAAM_ENV || 'tsandbox';
    this.urls = getShaamUrls(env);
  }

  /**
   * Submits invoice approval to SHAAM
   * @param accessToken - OAuth2 access token
   * @param approvalData - Invoice approval data
   * @returns Response from SHAAM API with confirmation_number (allocation number)
   */
  async submitApproval(
    accessToken: string,
    approvalData: ShaamApprovalDto,
  ): Promise<ShaamApprovalResponseDto> {
    if (!accessToken) {
      throw new BadRequestException('Access token is required');
    }

    // Validate payment amount calculation
    const paymentAmount = approvalData.payment_amount || 0;
    const vatAmount = approvalData.vat_amount || 0;
    const paymentAmountIncludingVat =
      approvalData.payment_amount_including_vat || 0;
    const expected = paymentAmount + vatAmount;
    const difference = Math.abs(paymentAmountIncludingVat - expected);

    if (difference > 0.01) {
      throw new BadRequestException(
        `payment_amount_including_vat (${paymentAmountIncludingVat}) must equal payment_amount (${paymentAmount}) + vat_amount (${vatAmount}). Difference: ${difference.toFixed(
          2,
        )}`,
      );
    }

    const approvalUrl = this.urls.invoicesApproval;
    const clientId = process.env.SHAAM_CLIENT_ID || '';
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(approvalUrl, approvalData, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-IBM-Client-Id': clientId,
            },
            timeout: REQUEST_TIMEOUT_MS,
          })
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      this.logSuccess('approval', approvalUrl, startedAt, response.status, {
        approved: response.data?.approved,
        confirmationReturned: Boolean(response.data?.confirmation_number),
      });

      return {
        ...response.data,
        status: response.status,
      } as ShaamApprovalResponseDto;
    } catch (error: any) {
      this.logFailure('approval', approvalUrl, startedAt, error);

      throw this.handleError(error);
    }
  }

  /**
   * Recovers an allocation number for a request whose response was lost.
   * The lookup fields are built from the persisted invoice, never from the
   * browser, and include the recommended final invoice reference number.
   */
  async recoverConfirmation(
    accessToken: string,
    lookup: ShaamConfirmationLookupDto,
  ): Promise<any> {
    if (!accessToken) throw new BadRequestException('Access token is required');
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(this.urls.invoiceConfirmation, lookup, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-IBM-Client-Id': process.env.SHAAM_CLIENT_ID || '',
            },
            timeout: REQUEST_TIMEOUT_MS,
          })
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      this.logSuccess(
        'confirmation_recovery',
        this.urls.invoiceConfirmation,
        startedAt,
        response.status,
        {
          confirmationReturned: Boolean(
            response.data?.confirmation_number ??
              response.data?.Confirmation_Number ??
              response.data?.message?.confirmation_number ??
              response.data?.message?.Confirmation_Number,
          ),
        },
      );
      return response.data;
    } catch (error: any) {
      this.logFailure(
        'confirmation_recovery',
        this.urls.invoiceConfirmation,
        startedAt,
        error,
      );
      throw this.handleError(error);
    }
  }

  async getInvoiceDetails(
    accessToken: string,
    confirmationNumber: string,
    vatNumber: number,
    customerVatNumber: number,
  ): Promise<ShaamInvoiceDetailsResponseDto> {
    if (!accessToken) throw new BadRequestException('Access token is required');
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(
            this.urls.invoiceDetails,
            {
              customer_vat_number: customerVatNumber,
              confirmation_number: confirmationNumber,
              vat_number: vatNumber,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-IBM-Client-Id': process.env.SHAAM_CLIENT_ID || '',
              },
              timeout: REQUEST_TIMEOUT_MS,
            },
          )
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      this.logSuccess(
        'allocation_details',
        this.urls.invoiceDetails,
        startedAt,
        response.status,
        { detailsReturned: Boolean(response.data?.message) },
      );
      return response.data as ShaamInvoiceDetailsResponseDto;
    } catch (error: any) {
      this.logFailure(
        'allocation_details',
        this.urls.invoiceDetails,
        startedAt,
        error,
      );
      throw this.handleError(error);
    }
  }

  private logSuccess(
    operation: string,
    url: string,
    startedAt: number,
    httpStatus: unknown,
    result: Record<string, boolean | undefined>,
  ): void {
    this.logger.log('SHAAM invoice API request succeeded', {
      operation,
      outcome: 'success',
      environment: this.environment(),
      gatewayHost: this.gatewayHost(url),
      clientIdConfigured: Boolean(process.env.SHAAM_CLIENT_ID),
      httpStatus: this.safeHttpStatus(httpStatus),
      durationMs: Date.now() - startedAt,
      ...result,
    });
  }

  private logFailure(
    operation: string,
    url: string,
    startedAt: number,
    error: any,
  ): void {
    this.logger.error('SHAAM invoice API request failed', {
      operation,
      outcome: 'failure',
      environment: this.environment(),
      gatewayHost: this.gatewayHost(url),
      clientIdConfigured: Boolean(process.env.SHAAM_CLIENT_ID),
      httpStatus: this.safeHttpStatus(error?.response?.status),
      durationMs: Date.now() - startedAt,
      errorCategory: this.errorCategory(error),
      providerErrorId: this.safeProviderErrorId(
        error?.response?.data?.error_id,
      ),
      providerReason: this.providerReason(error),
    });
  }

  private environment(): string {
    return (process.env.SHAAM_ENV || 'tsandbox').toLowerCase() === 'production'
      ? 'production'
      : 'tsandbox';
  }

  private gatewayHost(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'invalid-configured-url';
    }
  }

  private safeHttpStatus(value: unknown): number | null {
    const status = Number(value);
    return Number.isInteger(status) && status >= 100 && status <= 599
      ? status
      : null;
  }

  private errorCategory(error: any): string {
    if (error?.response) return 'provider_response';
    const code = String(error?.code || '').toUpperCase();
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout';
    return 'network_or_unknown';
  }

  private safeProviderErrorId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(normalized)
      ? normalized
      : null;
  }

  private providerReason(error: any): string {
    const source = [
      error?.response?.data?.message,
      error?.response?.data?.error_description,
      error?.response?.headers?.['www-authenticate'],
    ]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .toLowerCase();

    if (/invalid[_ -]?token/.test(source)) return 'invalid_token';
    if (/token.{0,24}expired|expired.{0,24}token/.test(source))
      return 'expired_token';
    if (/insufficient[_ -]?scope|invalid[_ -]?scope/.test(source))
      return 'scope_rejected';
    if (/client[_ -]?id|x-ibm-client-id|api[_ -]?key/.test(source))
      return 'client_identity_rejected';
    if (/not[_ -]?authori[sz]ed|unauthori[sz]ed/.test(source))
      return 'unauthorized';
    if (/forbidden/.test(source)) return 'forbidden';
    return 'unspecified';
  }

  private handleError(error: any): HttpException {
    if (!error.response) {
      return new HttpException(
        'Network error or timeout occurred',
        HttpStatus.REQUEST_TIMEOUT,
      );
    }

    const status = error.response.status;
    const data = error.response.data;

    // Handle 400 with errors array
    if (status === 400 && Array.isArray(data?.errors)) {
      return new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: data.errors,
      });
    }

    // Handle 406
    if (status === 406) {
      return new HttpException(
        {
          statusCode: 406,
          error_id: data?.error_id || 'NOT_ACCEPTABLE',
          message: data?.message || 'Request not acceptable',
        },
        HttpStatus.NOT_ACCEPTABLE,
      );
    }

    // Handle 500
    if (status === 500) {
      return new HttpException(
        {
          statusCode: 500,
          error_id: data?.error_id || 'INTERNAL_SERVER_ERROR',
          message: data?.message || 'Internal server error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Generic error handling
    return new HttpException(
      {
        statusCode: status,
        message: data?.message || error.message || 'Unknown error',
        error_id: data?.error_id,
      },
      status,
    );
  }
}
