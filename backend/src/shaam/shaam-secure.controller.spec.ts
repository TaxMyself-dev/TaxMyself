import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import {
  DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
  ShaamEnvironment,
  SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED,
} from './shaam.constants';
import { ShaamConnectionStatus, ShaamProduct } from './entities/shaam.enums';
import { ShaamSecureController } from './shaam-secure.controller';

describe('ShaamSecureController', () => {
  function setup(
    business: any = {
      id: 7,
      businessNumber: DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
      firebaseId: 'effective-owner',
    },
  ) {
    const businessService = {
      getBusinessByNumber: jest.fn().mockResolvedValue(business),
      getBusinessById: jest.fn().mockResolvedValue(business),
    };
    const states = {
      create: jest.fn().mockResolvedValue('opaque-state'),
      consume: jest.fn(),
    };
    const connections = {
      status: jest
        .fn()
        .mockResolvedValue({ connected: true, expiresAt: new Date() }),
      getValidAccessToken: jest.fn().mockResolvedValue('server-token'),
      saveToken: jest.fn().mockResolvedValue(ShaamConnectionStatus.ACTIVE),
      markReauthorizationRequired: jest.fn().mockResolvedValue(undefined),
    };
    const allocationOauth = {
      buildAuthorizeUrl: jest
        .fn()
        .mockReturnValue('https://openapi.taxes.gov.il/authorize'),
      exchangeCodeForToken: jest.fn(),
    };
    const uniformOauth = {
      buildAuthorizeUrl: jest.fn(),
      exchangeCodeForDailyToken: jest.fn(),
    };
    const documentAllocation = {
      requestAndFinalize: jest.fn().mockResolvedValue({ success: true }),
      recoverAndFinalize: jest.fn().mockResolvedValue({ success: true }),
    };
    const uniformSubmissions = {
      submit: jest.fn().mockResolvedValue({ id: 1, state: 'PROCESSING' }),
      get: jest.fn().mockResolvedValue({ id: 1, state: 'PROCESSING' }),
      poll: jest.fn().mockResolvedValue({ id: 1, state: 'APPROVED' }),
    };
    const controller = new ShaamSecureController(
      businessService as any,
      states as any,
      connections as any,
      allocationOauth as any,
      uniformOauth as any,
      documentAllocation as any,
      uniformSubmissions as any,
      { enabled: false, environment: ShaamEnvironment.TSANDBOX } as any,
    );
    return {
      controller,
      businessService,
      states,
      connections,
      allocationOauth,
      uniformOauth,
      documentAllocation,
      uniformSubmissions,
    };
  }

  const request = {
    user: { firebaseId: 'effective-owner', actorFirebaseId: 'effective-owner' },
  };

  it('scopes OAuth initiation to the owner and records the real actor', async () => {
    const { controller, businessService, states } = setup();
    await controller.authorize(request, {
      businessNumber: DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
      product: ShaamProduct.INVOICE_ALLOCATION,
    });
    expect(businessService.getBusinessByNumber).toHaveBeenCalledWith(
      DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
      'effective-owner',
    );
    expect(states.create).toHaveBeenCalledWith(
      7,
      'effective-owner',
      ShaamProduct.INVOICE_ALLOCATION,
      ShaamEnvironment.TSANDBOX,
    );
  });

  it('rejects an unauthorized business before creating OAuth state', async () => {
    const { controller, states } = setup(null);
    await expect(
      controller.authorize(request, {
        businessNumber: '111111118',
        product: ShaamProduct.INVOICE_ALLOCATION,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(states.create).not.toHaveBeenCalled();
  });

  it('does not create state while uniform-file OAuth is disabled', async () => {
    const { controller, states } = setup();
    await expect(
      controller.authorize(request, {
        businessNumber: '222222226',
        product: ShaamProduct.UNIFORM_FILE,
      }),
    ).rejects.toThrow('disabled');
    expect(states.create).not.toHaveBeenCalled();
  });

  it('blocks invoice-allocation OAuth for a non-demo business in tsandbox', async () => {
    const { controller, states } = setup({
      id: 9,
      businessNumber: '222222226',
    });

    await expect(
      controller.authorize(request, {
        businessNumber: '222222226',
        product: ShaamProduct.INVOICE_ALLOCATION,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED,
      }),
    });
    expect(states.create).not.toHaveBeenCalled();
  });

  it('does not apply the tsandbox issuer guard in production', async () => {
    const originalEnv = process.env.SHAAM_ENV;
    process.env.SHAAM_ENV = 'production';
    try {
      const { controller, states } = setup({
        id: 9,
        businessNumber: '222222226',
      });
      await controller.authorize(request, {
        businessNumber: '222222226',
        product: ShaamProduct.INVOICE_ALLOCATION,
      });
      expect(states.create).toHaveBeenCalledWith(
        9,
        'effective-owner',
        ShaamProduct.INVOICE_ALLOCATION,
        ShaamEnvironment.PRODUCTION,
      );
    } finally {
      if (originalEnv === undefined) delete process.env.SHAAM_ENV;
      else process.env.SHAAM_ENV = originalEnv;
    }
  });

  it('uses the server-held allocation token rather than a browser header', async () => {
    const { controller, connections, documentAllocation } = setup();
    await controller.submitApproval(
      request,
      DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
      { docNumber: '20000', docType: 'TAX_INVOICE' } as any,
    );
    expect(connections.getValidAccessToken).toHaveBeenCalledWith(
      7,
      ShaamProduct.INVOICE_ALLOCATION,
      ShaamEnvironment.TSANDBOX,
    );
    expect(documentAllocation.requestAndFinalize).toHaveBeenCalledWith(
      'server-token',
      'effective-owner',
      'effective-owner',
      DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
      '20000',
      'TAX_INVOICE',
    );
  });

  it('requires reconnection without exposing a token', async () => {
    const { controller, connections } = setup();
    connections.getValidAccessToken.mockResolvedValue(null);
    await expect(
      controller.submitApproval(
        request,
        DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
        { docNumber: '20000', docType: 'TAX_INVOICE' } as any,
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('scopes uniform-file submission and status routes to the resolved business', async () => {
    const { controller, uniformSubmissions } = setup({
      id: 9,
      businessNumber: '222222226',
    });

    await controller.submitUniformFile(request, '222222226', {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
    await controller.uniformFileSubmissionStatus(request, '222222226', 4);
    await controller.pollUniformFileSubmission(request, '222222226', 4);

    expect(uniformSubmissions.submit).toHaveBeenCalledWith(
      'effective-owner',
      'effective-owner',
      expect.objectContaining({ id: 9 }),
      '2025-01-01',
      '2025-12-31',
      undefined,
    );
    expect(uniformSubmissions.get).toHaveBeenCalledWith(4, 9);
    expect(uniformSubmissions.poll).toHaveBeenCalledWith(4, 9);
  });

  it('does not report a successful callback when required scopes were not granted', async () => {
    const { controller, states, connections, allocationOauth } = setup();
    states.consume.mockResolvedValue({
      businessId: 7,
      actorFirebaseId: 'effective-owner',
      product: ShaamProduct.INVOICE_ALLOCATION,
      environment: ShaamEnvironment.TSANDBOX,
    });
    allocationOauth.exchangeCodeForToken.mockResolvedValue({
      access_token: 'server-token',
      expires_in: 3600,
      scope: 'invoices_scope',
    });
    connections.saveToken.mockResolvedValue(
      ShaamConnectionStatus.REAUTH_REQUIRED,
    );
    const response = { redirect: jest.fn((url: string) => url) };

    await controller.callback(response as any, 'code', 'state');

    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('error=missing_required_scope'),
    );
    expect(response.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining('connected=true'),
    );
  });

  describe('Daily Token callback failures', () => {
    function callbackSetup() {
      const context = setup();
      context.states.consume.mockResolvedValue({
        businessId: 7,
        actorFirebaseId: 'effective-owner',
        product: ShaamProduct.UNIFORM_FILE,
        environment: ShaamEnvironment.TSANDBOX,
      });
      return { ...context, response: { redirect: jest.fn() } };
    }

    it.each([
      [undefined, undefined, 'missing_authorization_code'],
      ['', undefined, 'missing_authorization_code'],
      [' ', undefined, 'missing_authorization_code'],
      [undefined, 'invalid_scope', 'invalid_scope'],
      [undefined, 'access_denied', 'access_denied'],
      ['code-with-error', 'access_denied', 'access_denied'],
      [undefined, 'sensitive-provider-text', 'authorization_failed'],
      [undefined, ['invalid_scope', 'sensitive-provider-text'], 'authorization_failed'],
    ])('handles code=%p and error=%p without exchanging a token', async (code, error, expected) => {
      const { controller, states, response, uniformOauth, allocationOauth, connections } = callbackSetup();
      await controller.callback(response as any, code as any, 'private-state', error);
      expect(states.consume).toHaveBeenCalledWith('private-state');
      expect(uniformOauth.exchangeCodeForDailyToken).not.toHaveBeenCalled();
      expect(allocationOauth.exchangeCodeForToken).not.toHaveBeenCalled();
      expect(connections.saveToken).not.toHaveBeenCalled();
      const target = new URL(response.redirect.mock.calls[0][0]);
      expect(target.searchParams.get('connected')).toBe('false');
      expect(target.searchParams.get('product')).toBe(ShaamProduct.UNIFORM_FILE);
      expect(target.searchParams.get('error')).toBe(expected);
      expect(decodeURIComponent(target.search)).not.toMatch(/private-state|code-with-error|sensitive-provider-text/);
    });

    it('rejects invalid or reused state even when the provider returns an error', async () => {
      const { controller, states, response, uniformOauth, connections } = callbackSetup();
      states.consume.mockRejectedValue(new Error('Invalid or expired SHAAM OAuth state'));
      await expect(controller.callback(response as any, undefined, 'used-state', 'access_denied'))
        .rejects.toThrow('Invalid or expired SHAAM OAuth state');
      expect(response.redirect).not.toHaveBeenCalled();
      expect(uniformOauth.exchangeCodeForDailyToken).not.toHaveBeenCalled();
      expect(connections.saveToken).not.toHaveBeenCalled();
    });

    it('revalidates ownership before redirecting a provider error', async () => {
      const { controller, businessService, response, uniformOauth, connections } = callbackSetup();
      businessService.getBusinessById.mockResolvedValue({ firebaseId: 'different-owner' });
      await expect(controller.callback(response as any, undefined, 'state', 'access_denied'))
        .rejects.toThrow(ForbiddenException);
      expect(response.redirect).not.toHaveBeenCalled();
      expect(uniformOauth.exchangeCodeForDailyToken).not.toHaveBeenCalled();
      expect(connections.saveToken).not.toHaveBeenCalled();
    });

    it('preserves a successful Daily Token callback', async () => {
      const { controller, response, uniformOauth, allocationOauth, connections } = callbackSetup();
      const token = { access_token: 'server-only-token', expires_in: 3600 };
      uniformOauth.exchangeCodeForDailyToken.mockResolvedValue(token);
      await controller.callback(response as any, 'valid-code', 'state');
      expect(uniformOauth.exchangeCodeForDailyToken).toHaveBeenCalledWith('valid-code');
      expect(allocationOauth.exchangeCodeForToken).not.toHaveBeenCalled();
      expect(connections.saveToken).toHaveBeenCalledWith(
        7, 'effective-owner', ShaamProduct.UNIFORM_FILE, ShaamEnvironment.TSANDBOX, token,
      );
      expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('connected=true&product=UNIFORM_FILE'));
      expect(response.redirect.mock.calls[0][0]).not.toContain('server-only-token');
    });
  });

  it('rejects delegated or impersonated external SHAAM operations', async () => {
    const { controller, states } = setup();
    const delegated = {
      user: { firebaseId: 'effective-owner', actorFirebaseId: 'accountant' },
      isDelegatedAccess: true,
    };

    await expect(
      controller.authorize(delegated, {
        businessNumber: DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER,
        product: ShaamProduct.INVOICE_ALLOCATION,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(states.create).not.toHaveBeenCalled();
  });
});
