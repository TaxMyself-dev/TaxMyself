import { HttpException, HttpStatus } from '@nestjs/common';
import { Documents } from '../../documents/documents.entity';
import { DocumentStatusType, DocumentType } from '../../enum';
import { ShaamInvoiceAllocationAttempt } from '../entities/shaam-invoice-allocation-attempt.entity';
import { ShaamInvoiceAllocationAttemptState as State } from '../entities/shaam.enums';
import { ShaamInvoiceAllocationResolutionAction as ResolutionAction } from '../entities/shaam.enums';
import { ShaamAllocationOrchestratorService } from './shaam-allocation-orchestrator.service';

describe('ShaamAllocationOrchestratorService', () => {
  const document: any = {
    id: 10,
    issuerBusinessNumber: '123456789',
    recipientId: '987654321',
    docNumber: '20000',
    docType: DocumentType.TAX_INVOICE,
    generalDocIndex: '100001',
    docStatus: DocumentStatusType.PENDING_ALLOCATION,
    allocationNum: null,
    sumBefDisBefVat: 100,
    disSum: 0,
    sumAftDisBefVAT: 100,
    vatSum: 18,
    sumAftDisWithVAT: 118,
    docDate: '2026-10-21',
    issueDate: '2026-10-21',
  };

  function setup(latest: any = null) {
    const testDocument = { ...document, allocationNum: null };
    let currentAttempt: any = latest;
    const documentsRepo = { findOne: jest.fn().mockResolvedValue(testDocument) };
    const attemptsRepo = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(currentAttempt)),
      find: jest.fn(),
      save: jest.fn().mockImplementation(async (value) => {
        currentAttempt = value;
        return value;
      }),
    };
    const txDocumentsRepo = {
      findOne: jest.fn().mockResolvedValue(testDocument),
      save: jest.fn().mockResolvedValue(testDocument),
    };
    const txAttemptsRepo = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(currentAttempt)),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => {
        if (!value.id) value.id = 55;
        currentAttempt = value;
        return value;
      }),
    };
    const manager = {
      getRepository: jest.fn().mockImplementation((entity) =>
        entity === Documents ? txDocumentsRepo : txAttemptsRepo),
    };
    const dataSource = {
      transaction: jest.fn().mockImplementation((callback) => callback(manager)),
    };
    const invoices = { submitApproval: jest.fn() };
    const documentsService = { finalizeAllocation: jest.fn().mockResolvedValue({ success: true, docNumber: '20000' }) };
    const service = new ShaamAllocationOrchestratorService(
      documentsRepo as any, attemptsRepo as any, dataSource as any,
      invoices as any, documentsService as any,
    );
    return { service, invoices, documentsService, attemptsRepo, txDocumentsRepo, getAttempt: () => currentAttempt };
  }

  it('persists the attempt before Approval and stores success before local finalization', async () => {
    const ctx = setup();
    ctx.invoices.submitApproval.mockResolvedValue({
      status: 200,
      approved: true,
      confirmation_number: '123456789',
    });

    await ctx.service.requestAndFinalize('token', 'owner', 'actor', '123456789', '20000', DocumentType.TAX_INVOICE);

    expect(ctx.invoices.submitApproval).toHaveBeenCalledTimes(1);
    expect(ctx.txDocumentsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ allocationNum: '123456789' }));
    expect(ctx.getAttempt().state).toBe(State.APPROVED);
    expect(ctx.getAttempt().providerHttpStatus).toBe(200);
    expect(ctx.documentsService.finalizeAllocation).toHaveBeenCalledTimes(1);
  });

  it('marks a timeout unknown and blocks automatic replay', async () => {
    const ctx = setup();
    ctx.invoices.submitApproval.mockRejectedValue(new HttpException('timeout', HttpStatus.REQUEST_TIMEOUT));

    await expect(ctx.service.requestAndFinalize('token', 'owner', 'actor', '123456789', '20000', DocumentType.TAX_INVOICE))
      .rejects.toMatchObject({ status: 409 });

    expect(ctx.getAttempt().state).toBe(State.UNKNOWN_OUTCOME);
    expect(ctx.documentsService.finalizeAllocation).not.toHaveBeenCalled();
  });

  it('treats a malformed 2xx response as unknown rather than rejected', async () => {
    const ctx = setup();
    ctx.invoices.submitApproval.mockResolvedValue({ status: 200, message: 'unexpected shape' });

    await expect(ctx.service.requestAndFinalize('token', 'owner', 'actor', '123456789', '20000', DocumentType.TAX_INVOICE))
      .rejects.toMatchObject({ status: 409 });
    expect(ctx.getAttempt().state).toBe(State.UNKNOWN_OUTCOME);
    expect(ctx.documentsService.finalizeAllocation).not.toHaveBeenCalled();
  });

  it('does not call Approval while an existing lease is active', async () => {
    const ctx = setup({
      id: 9, documentId: document.id, attemptNumber: 1,
      requestId: 'request-id', state: State.PROCESSING,
      payloadSha256: 'irrelevant', leaseExpiresAt: new Date(Date.now() + 60000),
    });

    await expect(ctx.service.requestAndFinalize('token', 'owner', 'actor', '123456789', '20000', DocumentType.TAX_INVOICE))
      .rejects.toMatchObject({ status: 409 });
    expect(ctx.invoices.submitApproval).not.toHaveBeenCalled();
  });

  it('records admin evidence before permitting an exact retry', async () => {
    const ctx = setup({
      id: 9, documentId: document.id, attemptNumber: 1,
      requestId: 'request-id', state: State.UNKNOWN_OUTCOME,
    });

    await expect(ctx.service.resolveUnknown(9, 'admin', {
      action: ResolutionAction.CONFIRMED_NOT_ACCEPTED,
      evidenceReference: 'tax-support:123',
    })).resolves.toEqual({ state: State.SAFE_TO_RETRY });
    expect(ctx.getAttempt()).toEqual(expect.objectContaining({
      state: State.SAFE_TO_RETRY,
      resolutionEvidence: 'tax-support:123',
      resolvedByFirebaseId: 'admin',
    }));
  });

  it('stores an externally verified allocation in the admin transaction', async () => {
    const ctx = setup({
      id: 9, documentId: document.id, attemptNumber: 1,
      requestId: 'request-id', state: State.UNKNOWN_OUTCOME,
    });

    await expect(ctx.service.resolveUnknown(9, 'admin', {
      action: ResolutionAction.CONFIRMED_APPROVED,
      evidenceReference: 'tax-support:124',
      allocationNumber: '444555666',
    })).resolves.toEqual({ state: State.APPROVED_MANUAL });
    expect(ctx.txDocumentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allocationNum: '444555666' }),
    );
  });
});
