import {
  isNoInvoiceOutcome,
  replacementProcessingOutcome,
} from './document-outcome.util';
import { DocumentsService } from './documents.service';
import { DocumentProcessorService } from './document-processor.service';

describe('completed extraction without an invoice', () => {
  it.each(['{"invoices":[]}', '[]', '```json\n{"invoices":[]}\n```'])(
    'recognizes only a complete legacy empty response: %s',
    (rawResponse) => {
      expect(isNoInvoiceOutcome({ status: 'error', rawResponse })).toBe(true);
    },
  );
  it.each([
    'broken JSON',
    '{"invoices":',
    '{"invoices":[{}]}',
    '{"decision":"uncertain","invoices":[]}',
    '{"decision":"not_accounting","invoices":[]}',
    'null',
    '0',
    '{"error":"provider failure"}',
    '{"invoices":[],"error":"timeout"}',
  ])('retains real errors or ambiguous decisions: %s', (rawResponse) => {
    expect(isNoInvoiceOutcome({ status: 'error', rawResponse })).toBe(false);
  });
  it('does not override explicit uncertain evidence, rejection or user classification', () => {
    expect(
      isNoInvoiceOutcome({
        status: 'error',
        rawResponse: '{"invoices":[]}',
        rejectionReason: 'ai_uncertain',
      }),
    ).toBe(false);
    expect(
      isNoInvoiceOutcome({
        status: 'rejected',
        rawResponse: '{"invoices":[]}',
      }),
    ).toBe(false);
    expect(
      isNoInvoiceOutcome({
        status: 'archived',
        rawResponse: '{"invoices":[]}',
      }),
    ).toBe(false);
  });
  it('projects both new and legacy no-invoice rows without changing the original record', () => {
    const service: any = Object.create(DocumentsService.prototype);
    const legacy = {
      status: 'error',
      rawResponse: '{"invoices":[]}',
      rejectionReason: null,
    };
    expect(service.archiveItemStatusForDocument(legacy, new Map())).toBe(
      'NO_INVOICE_FOUND',
    );
    expect(legacy.status).toBe('error');
    expect(
      service.archiveItemStatusForDocument(
        { status: 'no_invoice_found' },
        new Map(),
      ),
    ).toBe('NO_INVOICE_FOUND');
    expect(
      service.archiveItemStatusForDocument(
        { status: 'error', rawResponse: 'timeout' },
        new Map(),
      ),
    ).toBe('ERROR');
  });
  it('separates a completed no-invoice replacement from failure, unfinished work and normal extraction', () => {
    expect(
      replacementProcessingOutcome([
        { status: 'error', rawResponse: '{"invoices":[]}' },
      ]),
    ).toBe('NO_INVOICE_FOUND');
    expect(replacementProcessingOutcome([{ status: 'no_invoice_found' }])).toBe(
      'NO_INVOICE_FOUND',
    );
    expect(
      replacementProcessingOutcome([
        { status: 'no_invoice_found' },
        { status: 'error', rawResponse: 'timeout' },
      ]),
    ).toBe('FAILED');
    expect(
      replacementProcessingOutcome([
        { status: 'no_invoice_found' },
        { status: 'pending_review' },
      ]),
    ).toBe('SUCCEEDED');
    expect(replacementProcessingOutcome([{ status: 'processing' }])).toBe(
      'PENDING',
    );
  });
  it('keeps truncated empty AI output unresolved and never reissues the call', async () => {
    const old = process.env.PROTECTED_PDF_ENABLED;
    process.env.PROTECTED_PDF_ENABLED = 'false';
    try {
      const processor: any = new DocumentProcessorService({inspect:async()=>({kind:'readable',pages:1})} as any);
      const create = jest
        .fn()
        .mockResolvedValue({
          stop_reason: 'max_tokens',
          usage: {},
          content: [{ type: 'text', text: '{"invoices":[]}' }],
        });
      processor.client = { messages: { create } };
      expect(
        (
          await processor.extract(
            Buffer.from('synthetic'),
            'application/pdf',
            [],
          )
        ).invoices,
      ).toBeNull();
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      if (old === undefined) delete process.env.PROTECTED_PDF_ENABLED;
      else process.env.PROTECTED_PDF_ENABLED = old;
    }
  });
});
