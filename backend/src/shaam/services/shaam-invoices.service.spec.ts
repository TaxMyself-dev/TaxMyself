import { of, throwError } from 'rxjs';
import { getShaamUrls } from '../shaam.constants';
import { isShaamAuthorizationRejection } from '../utils/shaam-authorization-error.util';
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
    for (const key of productionEnvKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

  it.each([401, 403])(
    'marks SHAAM invoice authorization response %s',
    async (status) => {
      process.env.SHAAM_ENV = 'tsandbox';
      const httpService = {
        post: jest.fn().mockReturnValue(
          throwError(() => ({ response: { status, data: {} } })),
        ),
      };
      const service = new ShaamInvoicesService(httpService as any);

      try {
        await service.recoverConfirmation('server-token', {} as any);
        throw new Error('Expected SHAAM authorization rejection');
      } catch (error: unknown) {
        expect(isShaamAuthorizationRejection(error)).toBe(true);
      }
    },
  );

  it('does not mark an invoice business-level 406 as an authorization rejection', async () => {
    process.env.SHAAM_ENV = 'tsandbox';
    const httpService = {
      post: jest.fn().mockReturnValue(
        throwError(() => ({ response: { status: 406, data: {} } })),
      ),
    };
    const service = new ShaamInvoicesService(httpService as any);

    try {
      await service.recoverConfirmation('server-token', {} as any);
      throw new Error('Expected SHAAM request rejection');
    } catch (error: unknown) {
      expect(isShaamAuthorizationRejection(error)).toBe(false);
    }
  });
});
