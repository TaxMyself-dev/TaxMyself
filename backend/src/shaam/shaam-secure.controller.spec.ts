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
    business: any = { id: 7, businessNumber: '222222226' },
    uniformEnabled = true,
  ) {
    const businessService = { getBusinessByNumber: jest.fn().mockResolvedValue(business) };
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

  const request = { user: { firebaseId: 'effective-owner', actorFirebaseId: 'real-actor' } };

  it('scopes OAuth initiation to the effective owner and records the real actor', async () => {
    const { controller, businessService, states } = setup();
    await controller.authorize(request, { businessNumber: '222222226', product: ShaamProduct.INVOICE_ALLOCATION });
    expect(businessService.getBusinessByNumber).toHaveBeenCalledWith('222222226', 'effective-owner');
    expect(states.create).toHaveBeenCalledWith(7, 'real-actor', ShaamProduct.INVOICE_ALLOCATION, ShaamEnvironment.TSANDBOX);
  });

  it('rejects an unauthorized business before creating OAuth state', async () => {
    const { controller, states } = setup(null);
    await expect(controller.authorize(request, { businessNumber: '111111118', product: ShaamProduct.INVOICE_ALLOCATION })).rejects.toThrow(BadRequestException);
    expect(states.create).not.toHaveBeenCalled();
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
      'effective-owner',
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
      ownerFirebaseId: 'effective-owner',
      actorFirebaseId: 'real-actor',
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
      'effective-owner',
      'server-token',
    );
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
