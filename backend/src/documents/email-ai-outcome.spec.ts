import { DocumentProcessorService } from './document-processor.service';
import { parseEmailAiOutcome } from './email-ai-outcome';

describe('Single-pass email AI decisions (mock provider only)', () => {
  it.each(['invalid', '{"invoices":[]}', '{"decision":"accounting","invoices":[]}', '{"decision":"not_accounting","invoices":[{}]}', '{"decision":"accounting","invoices":[{"document_type":"unknown"}]}'])('keeps malformed/ambiguous responses unresolved: %s', raw => {
    expect(parseEmailAiOutcome(raw)).toEqual({ decision: 'uncertain', invoices: null });
  });
  it('accepts an explicit clear negative without calling it a technical failure', () => {
    expect(parseEmailAiOutcome('{"decision":"not_accounting","invoices":[]}')).toEqual({ decision: 'not_accounting', invoices: [] });
  });
  it('extracts and decides in the same provider request with bounded retries/deadline', async () => {
    const create = jest.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"decision":"accounting","invoices":[{"document_type":"receipt","amount":12}]}' }] });
    const processor = new DocumentProcessorService({inspect:async()=>({kind:'readable',pages:1})} as any);
    (processor as any).client = { messages: { create } };
    const result = await processor.extract(Buffer.from('synthetic'), 'application/pdf', [], true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toEqual({ timeout: 45000, maxRetries: 0 });
    expect(result.intakeDecision).toBe('accounting');
    expect(result.invoices).toHaveLength(1);
    expect(create.mock.calls[0][0].system[0].text).toContain('untrusted data');
  });
  it('propagates a provider timeout without an extra provider request', async () => {
    const create = jest.fn().mockRejectedValue(new Error('timeout'));
    const processor = new DocumentProcessorService({inspect:async()=>({kind:'readable',pages:1})} as any);
    (processor as any).client = { messages: { create } };
    await expect(processor.extract(Buffer.from('synthetic'), 'application/pdf', [], true)).rejects.toThrow('timeout');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
