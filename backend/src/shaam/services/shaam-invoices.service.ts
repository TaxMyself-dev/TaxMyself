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
import { markShaamAuthorizationRejection } from '../utils/shaam-authorization-error.util';

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

    try {
      this.logger.log('Submitting invoice approval to SHAAM', {
        invoice_id: approvalData.invoice_id,
        invoice_reference_number: approvalData.invoice_reference_number,
        environment: process.env.SHAAM_ENV || 'tsandbox',
      });

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

      this.logger.log('Successfully submitted invoice approval', {
        invoice_id: approvalData.invoice_id,
        status: response.status,
        confirmation_number: response.data?.confirmation_number,
        approved: response.data?.approved,
      });

      return response.data as ShaamApprovalResponseDto;
    } catch (error: any) {
      this.logger.error('Failed to submit invoice approval', {
        invoice_id: approvalData.invoice_id,
        status: error.response?.status,
        errorId: error.response?.data?.error_id,
      });

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
      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to recover invoice allocation number', {
        invoice_reference_number: lookup.invoice_reference_number,
        status: error.response?.status,
      });
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
      return response.data as ShaamInvoiceDetailsResponseDto;
    } catch (error: any) {
      this.logger.error('Failed to verify recovered invoice allocation', {
        status: error.response?.status,
      });
      throw this.handleError(error);
    }
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
    const exception = new HttpException(
      {
        statusCode: status,
        message: data?.message || error.message || 'Unknown error',
        error_id: data?.error_id,
      },
      status,
    );
    return status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN
      ? markShaamAuthorizationRejection(exception)
      : exception;
  }
}
