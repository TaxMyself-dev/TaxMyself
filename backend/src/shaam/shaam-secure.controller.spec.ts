import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ShaamEnvironment } from './shaam.constants';
import { ShaamProduct } from './entities/shaam.enums';
import { ShaamSecureController } from './shaam-secure.controller';
import { markShaamAuthorizationRejection } from './utils/shaam-authorization-error.util';

describe('ShaamSecureController', () => {
  function setup(
    business: any = { id: 7, businessNumber: '222222226', firebaseId: 'owner' },
    uniformEnabled = true,
  ) {
    const businessService = {
      getBusinessByNumber: jest.fn().mockResolvedValue(business),
      getBusinessById: jest.fn().mockResolvedValue(business),
    };
    const states = { create: jest.fn().mockResolvedValue('opaque-state'), consume: jest.fn() };
    const connections = { status: jest.fn().mockResolvedValue({ connected: true, expiresAt: new Date() }), getValidAccessToken: jest.fn().mockResolvedValue('server-token'), saveToken: jest.fn(), markReauthorizationRequired: jest.fn().mockResolvedValue(undefined) };
    const allocationOauth = { buildAuthorizeUrl: jest.fn().mockReturnValue('https://openapi.taxes.gov.il/authorize'), exchangeCodeForToken: jest.fn() };
    const uniformOauth = { buildAuthorizeUrl: jest.fn(), exchangeCodeForDailyToken: jest.fn() };
    const documentAllocation = {
      requestAndFinalize: jest.fn().mockResolvedValue({ success: true }),
      recoverAndFinalize: jest.fn().mockResolvedValue({ success: true }),
    };
    const uniformSubmissions = {
      prepare: jest.fn().mockResolvedValue({ id: 91, state: 'GENERATED' }),
      status: jest.fn().mockResolvedValue({ id: 91, state: 'GENERATED' }),
      transfer: jest.fn().mockResolvedValue({ id: 91, state: 'PROCESSING' }),
      poll: jest.fn().mockResolvedValue({ id: 91, state: 'APPROVED' }),
    };
    const controller = new ShaamSecureController(businessService as any, states as any, connections as any, allocationOauth as any, uniformOauth as any, documentAllocation as any, uniformSubmissions as any, { enabled: uniformEnabled, environment: ShaamEnvironment.TSANDBOX } as any);
    return { controller, businessService, states, connections, documentAllocation, uniformSubmissions };
  }

  const request = { user: { firebaseId: 'owner', actorFirebaseId: 'owner' } };
  const delegatedRequest = {
    user: { firebaseId: 'owner', actorFirebaseId: 'accountant' },
    isDelegatedAccess: true,
  };

  it('scopes OAuth initiation to the owner and records the owner actor', async () => {
    const { controller, businessService, states } = setup();
    await controller.authorize(request, { businessNumber: '222222226', product: ShaamProduct.INVOICE_ALLOCATION });
    expect(businessService.getBusinessByNumber).toHaveBeenCalledWith('222222226', 'owner');
    expect(states.create).toHaveBeenCalledWith(7, 'owner', ShaamProduct.INVOICE_ALLOCATION, ShaamEnvironment.TSANDBOX);
  });

  it('blocks a delegated accountant before creating SHAAM OAuth state', async () => {
    const { controller, businessService, states } = setup();

    await expect(
      controller.authorize(delegatedRequest, {
        businessNumber: '222222226',
        product: ShaamProduct.INVOICE_ALLOCATION,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(businessService.getBusinessByNumber).not.toHaveBeenCalled();
    expect(states.create).not.toHaveBeenCalled();
  });

  it('blocks an admin impersonating a client before creating SHAAM OAuth state', async () => {
    const { controller, states } = setup();
    const adminRequest = {
      user: { firebaseId: 'owner', actorFirebaseId: 'admin' },
      isAdminImpersonation: true,
    };

    await expect(
      controller.authorize(adminRequest, {
        businessNumber: '222222226',
        product: ShaamProduct.UNIFORM_FILE,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(states.create).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized business before creating OAuth state', async () => {
    const { controller, states } = setup(null);
    await expect(controller.authorize(request, { businessNumber: '111111118', product: ShaamProduct.INVOICE_ALLOCATION })).rejects.toThrow(BadRequestException);
    expect(states.create).not.toHaveBeenCalled();
  });

  it('rejects an OAuth callback whose recorded actor is not the business owner', async () => {
    const { controller, states, connections } = setup();
    states.consume.mockResolvedValue({
      businessId: 7,
      actorFirebaseId: 'accountant',
      product: ShaamProduct.INVOICE_ALLOCATION,
      environment: ShaamEnvironment.TSANDBOX,
    });
    const response = { redirect: jest.fn() };

    await expect(
      controller.callback(response as any, 'authorization-code', 'opaque-state'),
    ).rejects.toThrow(ForbiddenException);

    expect(connections.saveToken).not.toHaveBeenCalled();
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('does not create state while uniform-file OAuth is disabled', async () => {
    const { controller, states } = setup(undefined, false);
    await expect(controller.authorize(request, { businessNumber: '222222226', product: ShaamProduct.UNIFORM_FILE })).rejects.toThrow('disabled');
    expect(states.create).not.toHaveBeenCalled();
  });

  it('uses the server-held allocation token rather than a browser header', async () => {
    const { controller, connections, documentAllocation } = setup();
    await controller.submitApproval(request, '222222226', { docNumber: '20000', docType: 'TAX_INVOICE' } as any);
    expect(connections.getValidAccessToken).toHaveBeenCalledWith(7, ShaamProduct.INVOICE_ALLOCATION, ShaamEnvironment.TSANDBOX);
    expect(documentAllocation.requestAndFinalize).toHaveBeenCalledWith(
      'server-token',
      'owner',
      '222222226',
      '20000',
      'TAX_INVOICE',
    );
  });

  it('requires reconnection without exposing a token', async () => {
    const { controller, connections } = setup();
    connections.getValidAccessToken.mockResolvedValue(null);
    await expect(controller.submitApproval(request, '222222226', { docNumber: '20000', docType: 'TAX_INVOICE' } as any)).rejects.toBeInstanceOf(HttpException);
  });

  it('prepares a uniform-file submission for the authorized effective owner', async () => {
    const { controller, uniformSubmissions } = setup();

    await controller.prepareUniformFileSubmission(request, {
      businessNumber: '222222226',
      startDate: '2026-02-01',
      endDate: '2026-03-31',
    });

    expect(uniformSubmissions.prepare).toHaveBeenCalledWith({
      businessId: 7,
      businessNumber: '222222226',
      ownerFirebaseId: 'owner',
      actorFirebaseId: 'owner',
      environment: ShaamEnvironment.TSANDBOX,
      periodStart: '2026-02-01',
      periodEnd: '2026-03-31',
    });
  });

  it('scopes uniform-file status to the authorized business', async () => {
    const { controller, uniformSubmissions } = setup();

    await controller.uniformFileSubmissionStatus(request, 91, '222222226');

    expect(uniformSubmissions.status).toHaveBeenCalledWith(7, 91);
  });

  it('transfers with the server-held Daily Token after business authorization', async () => {
    const { controller, connections, uniformSubmissions } = setup();

    await controller.transferUniformFileSubmission(
      request,
      91,
      '222222226',
    );

    expect(connections.getValidAccessToken).toHaveBeenCalledWith(
      7,
      ShaamProduct.UNIFORM_FILE,
      ShaamEnvironment.TSANDBOX,
    );
    expect(uniformSubmissions.transfer).toHaveBeenCalledWith(
      7,
      91,
      'owner',
      'server-token',
    );
  });

  it('allows delegated local preparation and status viewing but blocks every remote SHAAM operation', async () => {
    const { controller, connections, documentAllocation, uniformSubmissions } = setup();

    await expect(
      controller.prepareUniformFileSubmission(delegatedRequest, {
        businessNumber: '222222226',
        startDate: '2026-02-01',
        endDate: '2026-03-31',
      }),
    ).resolves.toEqual({ id: 91, state: 'GENERATED' });
    await expect(
      controller.uniformFileSubmissionStatus(delegatedRequest, 91, '222222226'),
    ).resolves.toEqual({ id: 91, state: 'GENERATED' });

    await expect(
      controller.connectionStatus(
        delegatedRequest,
        '222222226',
        ShaamProduct.INVOICE_ALLOCATION,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.submitApproval(delegatedRequest, '222222226', {
        docNumber: '20000',
        docType: 'TAX_INVOICE',
      } as any),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.recoverApproval(delegatedRequest, '222222226', {
        docNumber: '20000',
        docType: 'TAX_INVOICE',
      } as any),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.transferUniformFileSubmission(delegatedRequest, 91, '222222226'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.pollUniformFileSubmission(delegatedRequest, 91, '222222226'),
    ).rejects.toThrow(ForbiddenException);

    expect(connections.getValidAccessToken).not.toHaveBeenCalled();
    expect(documentAllocation.requestAndFinalize).not.toHaveBeenCalled();
    expect(documentAllocation.recoverAndFinalize).not.toHaveBeenCalled();
    expect(uniformSubmissions.transfer).not.toHaveBeenCalled();
    expect(uniformSubmissions.poll).not.toHaveBeenCalled();
  });

  it('does not transfer without a valid Daily Token', async () => {
    const { controller, connections, uniformSubmissions } = setup();
    connections.getValidAccessToken.mockResolvedValue(null);

    await expect(
      controller.transferUniformFileSubmission(request, 91, '222222226'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(uniformSubmissions.transfer).not.toHaveBeenCalled();
  });

  it('polls only the authorized business submission', async () => {
    const { controller, uniformSubmissions } = setup();

    await controller.pollUniformFileSubmission(request, 91, '222222226');

    expect(uniformSubmissions.poll).toHaveBeenCalledWith(7, 91, 'server-token');
  });

  it('marks the allocation connection for reauthorization after a 401', async () => {
    const { controller, connections, documentAllocation } = setup();
    const rejection = markShaamAuthorizationRejection(
      new UnauthorizedException('token rejected'),
    );
    documentAllocation.requestAndFinalize.mockRejectedValue(rejection);

    await expect(
      controller.submitApproval(request, '222222226', {
        docNumber: '20000',
        docType: 'TAX_INVOICE',
      } as any),
    ).rejects.toBe(rejection);

    expect(connections.markReauthorizationRequired).toHaveBeenCalledWith(
      7,
      ShaamProduct.INVOICE_ALLOCATION,
      ShaamEnvironment.TSANDBOX,
    );
  });

  it('keeps the allocation connection active after a business-level 406', async () => {
    const { controller, connections, documentAllocation } = setup();
    const rejection = new HttpException('not acceptable', HttpStatus.NOT_ACCEPTABLE);
    documentAllocation.requestAndFinalize.mockRejectedValue(rejection);

    await expect(
      controller.submitApproval(request, '222222226', {
        docNumber: '20000',
        docType: 'TAX_INVOICE',
      } as any),
    ).rejects.toBe(rejection);

    expect(connections.markReauthorizationRequired).not.toHaveBeenCalled();
  });

  it('marks the uniform-file connection for reauthorization after a 403', async () => {
    const { controller, connections, uniformSubmissions } = setup();
    const rejection = markShaamAuthorizationRejection(
      new ForbiddenException('request denied'),
    );
    uniformSubmissions.transfer.mockRejectedValue(rejection);

    await expect(
      controller.transferUniformFileSubmission(request, 91, '222222226'),
    ).rejects.toBe(rejection);

    expect(connections.markReauthorizationRequired).toHaveBeenCalledWith(
      7,
      ShaamProduct.UNIFORM_FILE,
      ShaamEnvironment.TSANDBOX,
    );
  });

  it('does not invalidate a connection after a non-authorization upstream failure', async () => {
    const { controller, connections, uniformSubmissions } = setup();
    const rejection = new HttpException('upstream failure', HttpStatus.BAD_GATEWAY);
    uniformSubmissions.poll.mockRejectedValue(rejection);

    await expect(
      controller.pollUniformFileSubmission(request, 91, '222222226'),
    ).rejects.toBe(rejection);

    expect(connections.markReauthorizationRequired).not.toHaveBeenCalled();
  });

  it('does not invalidate a connection after an unmarked local 403', async () => {
    const { controller, connections, uniformSubmissions } = setup();
    uniformSubmissions.transfer.mockRejectedValue(
      new ForbiddenException('local authorization failed'),
    );

    await expect(
      controller.transferUniformFileSubmission(request, 91, '222222226'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(connections.markReauthorizationRequired).not.toHaveBeenCalled();
  });
});
