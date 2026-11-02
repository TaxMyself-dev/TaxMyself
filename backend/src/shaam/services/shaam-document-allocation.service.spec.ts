import { DocumentStatusType, DocumentType } from '../../enum';
import { ShaamDocumentAllocationService } from './shaam-document-allocation.service';

describe('ShaamDocumentAllocationService', () => {
  const pendingDoc = {
    id: 69,
    issuerBusinessNumber: '777777715',
    recipientId: '515000008',
    docType: DocumentType.TAX_INVOICE,
    generalDocIndex: '641948',
    docNumber: '20000',
    docStatus: DocumentStatusType.PENDING_ALLOCATION,
    docDate: '2026-10-14',
    issueDate: '2026-10-14',
    sumBefDisBefVat: '6000.00',
    disSum: '0.00',
    sumAftDisBefVAT: '6000.00',
    vatSum: '1080.00',
    sumAftDisWithVAT: '7080.00',
    allocationNum: null,
  } as any;

  function setup(doc: any = { ...pendingDoc }) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(doc),
      save: jest.fn(async (value) => value),
    };
    const invoices = {
      submitApproval: jest.fn().mockResolvedValue({
        approved: true,
        confirmation_number: '20261014123456789012345678',
      }),
      recoverConfirmation: jest
        .fn()
        .mockResolvedValue({ status: 200, message: null }),
      getInvoiceDetails: jest.fn().mockResolvedValue({
        status: 200,
        message: {
          invoice_type: 305,
          vat_number: 777777715,
          customer_vat_number: 515000008,
          invoice_reference_number: '20000',
          invoice_date: '2026-10-14',
          invoice_issuance_date: '2026-10-14',
          amount_before_discount: 6000,
          discount: 0,
          payment_amount: 6000,
          vat_amount: 1080,
          payment_amount_including_vat: 7080,
        },
      }),
    };
    const documentsService = {
      finalizeAllocation: jest
        .fn()
        .mockResolvedValue({ success: true, docNumber: '20000' }),
    };
    return {
      service: new ShaamDocumentAllocationService(
        repo as any,
        invoices as any,
        documentsService as any,
      ),
      repo,
      invoices,
      documentsService,
      doc,
    };
  }

  it('builds approval data only from the persisted final invoice identity', async () => {
    const { service, invoices, repo, documentsService } = setup();

    await service.requestAndFinalize(
      'server-token',
      'owner',
      '777777715',
      '20000',
      DocumentType.TAX_INVOICE,
    );

    expect(invoices.submitApproval).toHaveBeenCalledWith(
      'server-token',
      expect.objectContaining({
        invoice_id: 'KT-777777715-641948',
        invoice_reference_number: '20000',
        invoice_type: 305,
        payment_amount: 6000,
        vat_amount: 1080,
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allocationNum: '20261014123456789012345678' }),
    );
    expect(documentsService.finalizeAllocation).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ docNumber: '20000' }),
    );
    expect(
      invoices.recoverConfirmation.mock.invocationCallOrder[0],
    ).toBeLessThan(invoices.submitApproval.mock.invocationCallOrder[0]);
  });

  it('never submits another approval when the allocation was already persisted', async () => {
    const { service, invoices, documentsService } = setup({
      ...pendingDoc,
      allocationNum: '20261014123456789012345678',
    });

    await service.requestAndFinalize(
      'server-token',
      'owner',
      '777777715',
      '20000',
      DocumentType.TAX_INVOICE,
    );

    expect(invoices.submitApproval).not.toHaveBeenCalled();
    expect(documentsService.finalizeAllocation).toHaveBeenCalledTimes(1);
  });

  it('does not submit Approval when recovery fails ambiguously', async () => {
    const { service, invoices } = setup();
    invoices.recoverConfirmation.mockRejectedValue(
      new Error('recovery timeout'),
    );

    await expect(
      service.requestAndFinalize(
        'server-token',
        'owner',
        '777777715',
        '20000',
        DocumentType.TAX_INVOICE,
      ),
    ).rejects.toThrow('recovery timeout');

    expect(invoices.submitApproval).not.toHaveBeenCalled();
  });

  it('recovers a lost response using the persisted invoice fields', async () => {
    const { service, invoices, repo } = setup();
    invoices.recoverConfirmation.mockResolvedValue({
      status: 200,
      message: { confirmation_number: '20261014123456789012345678' },
    });

    await service.recoverAndFinalize(
      'server-token',
      'owner',
      '777777715',
      '20000',
      DocumentType.TAX_INVOICE,
    );

    expect(invoices.recoverConfirmation).toHaveBeenCalledWith('server-token', {
      customer_vat_number: 515000008,
      vat_number: 777777715,
      payment_amount: 6000,
      vat_amount: 1080,
      invoice_date: '2026-10-14',
      invoice_reference_number: '20000',
    });
    expect(invoices.getInvoiceDetails).toHaveBeenCalledWith(
      'server-token',
      '20261014123456789012345678',
      777777715,
      515000008,
    );
    expect(repo.save).toHaveBeenCalled();
    expect(invoices.submitApproval).not.toHaveBeenCalled();
  });

  it('persists a v2 allocation number at the documented 50-character limit', async () => {
    const { service, invoices, repo, documentsService } = setup();
    const allocationNumber = 'A'.repeat(50);
    invoices.recoverConfirmation.mockResolvedValue({
      status: 200,
      confirmation_number: allocationNumber,
    });

    await service.recoverAndFinalize(
      'server-token',
      'owner',
      '777777715',
      '20000',
      DocumentType.TAX_INVOICE,
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allocationNum: allocationNumber }),
    );
    expect(documentsService.finalizeAllocation).toHaveBeenCalledTimes(1);
  });

  it('rejects an allocation number longer than the v2 50-character limit', async () => {
    const { service, invoices, repo, documentsService } = setup();
    invoices.recoverConfirmation.mockResolvedValue({
      status: 200,
      confirmation_number: 'A'.repeat(51),
    });

    await expect(
      service.recoverAndFinalize(
        'server-token',
        'owner',
        '777777715',
        '20000',
        DocumentType.TAX_INVOICE,
      ),
    ).rejects.toThrow('SHAAM returned an invalid allocation number');

    expect(repo.save).not.toHaveBeenCalled();
    expect(documentsService.finalizeAllocation).not.toHaveBeenCalled();
  });

  it('does not persist or finalize a recovered allocation whose details do not match', async () => {
    const { service, invoices, repo, documentsService } = setup();
    invoices.recoverConfirmation.mockResolvedValue({
      status: 200,
      confirmation_number: '20261014123456789012345678',
    });
    invoices.getInvoiceDetails.mockResolvedValue({
      status: 200,
      message: {
        invoice_type: 305,
        vat_number: 777777715,
        customer_vat_number: 515000008,
        invoice_reference_number: '888',
        invoice_date: '2026-08-19',
        invoice_issuance_date: '2026-08-19',
        amount_before_discount: 8300.64,
        discount: 0,
        payment_amount: 8300.64,
        vat_amount: 90,
        payment_amount_including_vat: 10000.8,
      },
    });

    await expect(
      service.recoverAndFinalize(
        'server-token',
        'owner',
        '777777715',
        '20000',
        DocumentType.TAX_INVOICE,
      ),
    ).rejects.toThrow(
      'Recovered SHAAM allocation does not match the persisted invoice',
    );

    expect(repo.save).not.toHaveBeenCalled();
    expect(documentsService.finalizeAllocation).not.toHaveBeenCalled();
    expect(invoices.submitApproval).not.toHaveBeenCalled();
  });

  it('treats a known tsandbox fixture mismatch as no recovery and submits Approval', async () => {
    const originalEnv = process.env.SHAAM_ENV;
    process.env.SHAAM_ENV = 'tsandbox';
    try {
      const { service, invoices, repo } = setup();
      invoices.recoverConfirmation.mockResolvedValue({
        status: 200,
        confirmation_number: '20261014111111111111111111',
      });
      invoices.getInvoiceDetails.mockResolvedValue({
        status: 200,
        message: { invoice_reference_number: '888' },
      });

      await service.requestAndFinalize(
        'server-token',
        'owner',
        '777777715',
        '20000',
        DocumentType.TAX_INVOICE,
      );

      expect(invoices.submitApproval).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          allocationNum: '20261014123456789012345678',
        }),
      );
    } finally {
      if (originalEnv === undefined) delete process.env.SHAAM_ENV;
      else process.env.SHAAM_ENV = originalEnv;
    }
  });

  it('blocks Approval when recovered production details do not match', async () => {
    const originalEnv = process.env.SHAAM_ENV;
    process.env.SHAAM_ENV = 'production';
    try {
      const { service, invoices, repo, documentsService } = setup();
      invoices.recoverConfirmation.mockResolvedValue({
        status: 200,
        confirmation_number: '20261014111111111111111111',
      });
      invoices.getInvoiceDetails.mockResolvedValue({
        status: 200,
        message: { invoice_reference_number: '888' },
      });

      await expect(
        service.requestAndFinalize(
          'server-token',
          'owner',
          '777777715',
          '20000',
          DocumentType.TAX_INVOICE,
        ),
      ).rejects.toThrow(
        'Recovered SHAAM allocation does not match the persisted invoice',
      );

      expect(invoices.submitApproval).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(documentsService.finalizeAllocation).not.toHaveBeenCalled();
    } finally {
      if (originalEnv === undefined) delete process.env.SHAAM_ENV;
      else process.env.SHAAM_ENV = originalEnv;
    }
  });
});
