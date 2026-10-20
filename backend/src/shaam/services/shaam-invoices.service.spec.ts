import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { getShaamUrls } from '../shaam.constants';
import { ShaamInvoicesService } from './shaam-invoices.service';

describe('ShaamInvoicesService', () => {
  const productionEnvKeys = [
    'SHAAM_ENV',
    'SHAAM_INVOICE_PRODUCTION_ENABLED',
    'SHAAM_INVOICE_AUTHORIZE_URL',
    'SHAAM_INVOICE_TOKEN_URL',
    'SHAAM_INVOICE_APPROVAL_URL',
    'SHAAM_INVOICE_CONFIRMATION_URL',
    'SHAAM_INVOICE_DETAILS_URL',
  ] as const;
  const originalEnv = Object.fromEntries(
    productionEnvKeys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of productionEnvKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('logs a useful recovery success without invoice, business, allocation or token data', async () => {
    process.env.SHAAM_ENV = 'tsandbox';
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const httpService = {
      post: jest.fn().mockReturnValue(
        of({
          status: 200,
          data: { confirmation_number: '20261014123456789012345678' },
        }),
      ),
    };
    const service = new ShaamInvoicesService(httpService as any);

    await service.recoverConfirmation('secret-server-token', {
      customer_vat_number: 515000008,
      vat_number: 777777715,
      payment_amount: 6000,
      vat_amount: 1080,
      invoice_date: '2026-10-14',
      invoice_reference_number: '20000',
    });

    expect(log).toHaveBeenCalledWith(
      'SHAAM invoice API request succeeded',
      expect.objectContaining({
        operation: 'confirmation_recovery',
        outcome: 'success',
        environment: 'tsandbox',
        gatewayHost: 'ita-api.taxes.gov.il',
        clientIdConfigured: false,
        httpStatus: 200,
        durationMs: expect.any(Number),
        confirmationReturned: true,
      }),
    );
    const serialized = JSON.stringify(log.mock.calls);
    for (const sensitiveValue of [
      'secret-server-token',
      '515000008',
      '777777715',
      '6000',
      '1080',
      '2026-10-14',
      '20000',
      '20261014123456789012345678',
    ]) {
      expect(serialized).not.toContain(sensitiveValue);
    }
  });

  it('logs a sanitized provider failure without raw provider or request data', async () => {
    process.env.SHAAM_ENV = 'tsandbox';
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const httpService = {
      post: jest.fn().mockReturnValue(
        throwError(() => ({
          response: {
            status: 401,
            data: {
              error_id: 'INVALID_SCOPE',
              message:
                'Invalid scope for business 777777715 using token secret-token',
            },
          },
        })),
      ),
    };
    const service = new ShaamInvoicesService(httpService as any);

    await expect(
      service.recoverConfirmation('secret-token', {
        customer_vat_number: 515000008,
        vat_number: 777777715,
        payment_amount: 6000,
        vat_amount: 1080,
        invoice_date: '2026-10-14',
        invoice_reference_number: '20000',
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(error).toHaveBeenCalledWith(
      'SHAAM invoice API request failed',
      expect.objectContaining({
        operation: 'confirmation_recovery',
        outcome: 'failure',
        environment: 'tsandbox',
        gatewayHost: 'ita-api.taxes.gov.il',
        clientIdConfigured: false,
        httpStatus: 401,
        durationMs: expect.any(Number),
        errorCategory: 'provider_response',
        providerErrorId: 'INVALID_SCOPE',
        providerReason: 'scope_rejected',
      }),
    );
    const serialized = JSON.stringify(error.mock.calls);
    for (const sensitiveValue of [
      'secret-token',
      '515000008',
      '777777715',
      '6000',
      '1080',
      '2026-10-14',
      '20000',
      'Invalid scope for business',
    ]) {
      expect(serialized).not.toContain(sensitiveValue);
    }
  });

  it('drops provider error identifiers that are not bounded technical codes', async () => {
    process.env.SHAAM_ENV = 'tsandbox';
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const httpService = {
      post: jest.fn().mockReturnValue(
        throwError(() => ({
          response: {
            status: 401,
            data: { error_id: 'customer 515000008 was rejected' },
          },
        })),
      ),
    };
    const service = new ShaamInvoicesService(httpService as any);

    await expect(
      service.recoverConfirmation('secret-token', {
        customer_vat_number: 515000008,
        vat_number: 777777715,
        payment_amount: 6000,
        vat_amount: 1080,
        invoice_date: '2026-10-14',
        invoice_reference_number: '20000',
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(error.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        providerErrorId: null,
        providerReason: 'unspecified',
      }),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('515000008');
  });

  it('uses Invoice Information v2 and lower snake case in tsandbox', async () => {
    process.env.SHAAM_ENV = 'tsandbox';
    expect(getShaamUrls('tsandbox').token).toBe(
      'https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/token',
    );
    const httpService = {
      post: jest
        .fn()
        .mockReturnValue(of({ status: 200, data: { status: 200 } })),
    };
    const service = new ShaamInvoicesService(httpService as any);

    await service.recoverConfirmation('server-token', {
      customer_vat_number: 515000008,
      vat_number: 777777715,
      payment_amount: 6000,
      vat_amount: 1080,
      invoice_date: '2026-10-14',
      invoice_reference_number: '20000',
    });

    expect(httpService.post).toHaveBeenCalledWith(
      'https://ita-api.taxes.gov.il/shaam/tsandbox/invoice-information/v2/confirmationNumber',
      {
        customer_vat_number: 515000008,
        vat_number: 777777715,
        payment_amount: 6000,
        vat_amount: 1080,
        invoice_date: '2026-10-14',
        invoice_reference_number: '20000',
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('retrieves v2 invoice details with only server-built identifiers', async () => {
    process.env.SHAAM_ENV = 'tsandbox';
    const httpService = {
      post: jest.fn().mockReturnValue(
        of({
          status: 200,
          data: { status: 200, message: { invoice_reference_number: '20000' } },
        }),
      ),
    };
    const service = new ShaamInvoicesService(httpService as any);

    await service.getInvoiceDetails(
      'server-token',
      '20261014123456789012345678',
      777777715,
      515000008,
    );

    expect(httpService.post).toHaveBeenCalledWith(
      'https://ita-api.taxes.gov.il/shaam/tsandbox/invoice-information/v2/details',
      {
        customer_vat_number: 515000008,
        confirmation_number: '20261014123456789012345678',
        vat_number: 777777715,
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-token',
        }),
      }),
    );
  });

  it('uses Invoice Information v2 and lower snake case in production', async () => {
    process.env.SHAAM_ENV = 'production';
    process.env.SHAAM_INVOICE_PRODUCTION_ENABLED = 'true';
    process.env.SHAAM_INVOICE_AUTHORIZE_URL =
      'https://openapi.taxes.gov.il/shaam/production/longtimetoken/oauth2/authorize';
    process.env.SHAAM_INVOICE_TOKEN_URL =
      'https://t-ita-api.taxes.gov.il/shaam/production/longtimetoken/oauth2/token';
    process.env.SHAAM_INVOICE_APPROVAL_URL =
      'https://openapi.taxes.gov.il/shaam/production/Invoices/v2/Approval';
    process.env.SHAAM_INVOICE_CONFIRMATION_URL =
      'https://openapi.taxes.gov.il/shaam/production/invoice-information/v2/confirmationNumber';
    process.env.SHAAM_INVOICE_DETAILS_URL =
      'https://openapi.taxes.gov.il/shaam/production/invoice-information/v2/details';
    const httpService = {
      post: jest.fn().mockReturnValue(
        of({
          status: 200,
          data: {
            status: 200,
            confirmation_number: '20261014123456789012345678',
          },
        }),
      ),
    };
    const service = new ShaamInvoicesService(httpService as any);
    const lookup = {
      customer_vat_number: 515000008,
      vat_number: 777777715,
      payment_amount: 6000,
      vat_amount: 1080,
      invoice_date: '2026-10-14',
      invoice_reference_number: '20000',
    };

    await service.recoverConfirmation('server-token', lookup);

    expect(httpService.post).toHaveBeenCalledWith(
      process.env.SHAAM_INVOICE_CONFIRMATION_URL,
      lookup,
      expect.any(Object),
    );
  });

  it('rejects a production confirmation URL that is not v2', () => {
    process.env.SHAAM_ENV = 'production';
    process.env.SHAAM_INVOICE_PRODUCTION_ENABLED = 'true';
    process.env.SHAAM_INVOICE_AUTHORIZE_URL =
      'https://openapi.taxes.gov.il/shaam/production/longtimetoken/oauth2/authorize';
    process.env.SHAAM_INVOICE_TOKEN_URL =
      'https://t-ita-api.taxes.gov.il/shaam/production/longtimetoken/oauth2/token';
    process.env.SHAAM_INVOICE_APPROVAL_URL =
      'https://openapi.taxes.gov.il/shaam/production/Invoices/v2/Approval';
    process.env.SHAAM_INVOICE_CONFIRMATION_URL =
      'https://openapi.taxes.gov.il/shaam/production/invoice-information/v1/confirmationNumber';
    process.env.SHAAM_INVOICE_DETAILS_URL =
      'https://openapi.taxes.gov.il/shaam/production/invoice-information/v2/details';

    expect(() => new ShaamInvoicesService({} as any)).toThrow(
      'Invalid production SHAAM URL: invoiceConfirmation',
    );
  });

  it('rejects a production details URL that is not v2', () => {
    process.env.SHAAM_ENV = 'production';
    process.env.SHAAM_INVOICE_PRODUCTION_ENABLED = 'true';
    process.env.SHAAM_INVOICE_AUTHORIZE_URL =
      'https://openapi.taxes.gov.il/shaam/production/longtimetoken/oauth2/authorize';
    process.env.SHAAM_INVOICE_TOKEN_URL =
      'https://t-ita-api.taxes.gov.il/shaam/production/longtimetoken/oauth2/token';
    process.env.SHAAM_INVOICE_APPROVAL_URL =
      'https://openapi.taxes.gov.il/shaam/production/Invoices/v2/Approval';
    process.env.SHAAM_INVOICE_CONFIRMATION_URL =
      'https://openapi.taxes.gov.il/shaam/production/invoice-information/v2/confirmationNumber';
    process.env.SHAAM_INVOICE_DETAILS_URL =
      'https://openapi.taxes.gov.il/shaam/production/invoice-information/v1/details';

    expect(() => new ShaamInvoicesService({} as any)).toThrow(
      'Invalid production SHAAM URL: invoiceDetails',
    );
  });
});
