import { DocumentProcessorService } from './document-processor.service';
describe('recipient identity uses the existing single document AI response', () => {
  it('asks for buyer and seller separately and retains recipient fields from the same response', async () => {
    const fields = {
      document_type: 'invoice',
      supplier: 'Seller',
      supplier_id: '123456789',
      recipient_name: 'Buyer',
      recipient_tax_id: '987654321',
      recipient_identity_evidence: 'Customer VAT ID: 987654321',
    };
    const create = jest.fn(async () => ({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({ decision: 'accounting', invoices: [fields] }),
        },
      ],
    }));
    const service: any = new DocumentProcessorService();
    service.client = { messages: { create } };
    const result = await service.extract(
      Buffer.from('synthetic-image'),
      'image/png',
      [],
      true,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.invoices).toEqual([fields]);
    const prompt = (create.mock.calls as any)[0][0].system[0].text;
    expect(prompt).toContain('recipient_tax_id');
    expect(prompt).toContain('BUYER/customer');
    expect(prompt).toContain('SELLER');
  });
});
