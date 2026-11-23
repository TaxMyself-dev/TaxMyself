import { DocumentProcessorService } from './document-processor.service';
import { GMAIL_DOCUMENT_TYPES } from './gmail-document-policy';
const saved = { ...process.env };
afterEach(() => {
  for (const key of ['GMAIL_DURABLE_INTAKE_ENABLED', 'PROTECTED_PDF_ENABLED']) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
function subject() {
  const processor = new DocumentProcessorService({
    inspect: async () => ({ kind: 'readable', pages: 1 }),
  } as any);
  const create = jest
    .fn()
    .mockResolvedValue({
      stop_reason: 'end_turn',
      usage: {},
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            decision: 'accounting',
            invoices: GMAIL_DOCUMENT_TYPES.map((document_type) => ({
              document_type,
              amount: null,
            })),
          }),
        },
      ],
    });
  (processor as any).client = { messages: { create } };
  return { processor, create };
}
it('sends one coherent six-type contract to the actual SDK boundary', async () => {
  process.env.GMAIL_DURABLE_INTAKE_ENABLED = 'true';
  process.env.PROTECTED_PDF_ENABLED = 'true';
  const t = subject();
  const result = await t.processor.extract(
    Buffer.from('%PDF-fixture'),
    'application/pdf',
    [],
    true,
  );
  const prompt = t.create.mock.calls[0][0].system[0].text;
  expect(prompt).toContain('insurance_policy');
  expect(prompt).toContain('license_fee');
  expect(prompt).toContain('supplier_id');
  expect(prompt).toContain('invoice_number');
  expect(prompt).not.toContain('"form_106"');
  expect(prompt).not.toContain('"tax_form"');
  expect(prompt).not.toContain('"contract"');
  expect(prompt).not.toContain('"unknown"');
  expect(prompt).not.toContain('If the file contains no recognizable invoices');
  expect(result.intakeDecision).toBe('accounting');
  expect(result.invoices).toHaveLength(6);
  expect(t.create).toHaveBeenCalledTimes(1);
  expect(t.create.mock.calls[0][1]).toEqual({ timeout: 45000, maxRetries: 0 });
});
it('preserves the legacy prompt for other channels', async () => {
  process.env.GMAIL_DURABLE_INTAKE_ENABLED = 'true';
  const t = subject();
  await t.processor.extract(
    Buffer.from('%PDF-fixture'),
    'application/pdf',
    [],
    false,
  );
  const prompt = t.create.mock.calls[0][0].system[0].text;
  expect(prompt).toContain('"form_106"');
  expect(prompt).not.toContain('Gmail intake policy');
});
