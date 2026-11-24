import { AnthropicDocumentProvider } from './anthropic-document.provider';
import { ProviderRejectedError } from './document-ai.types';
const input: any = {
  bytes: Buffer.from('synthetic'),
  mimeType: 'image/png',
  catalog: [],
  gmailPolicy: false,
};
describe('document provider transport (offline)', () => {
  it('rechecks current source rules immediately before AI and never calls the provider if blocked',async()=>{
    const extract=jest.fn();
    const beforeAnalyze=jest.fn(async()=>{throw new Error('EMAIL_SENDER_BLOCKED');});
    await expect(new AnthropicDocumentProvider({extract} as any).analyze({...input,beforeAnalyze},'claude-frozen')).rejects.toMatchObject({code:'EMAIL_SENDER_BLOCKED'});
    expect(beforeAnalyze).toHaveBeenCalledTimes(1);expect(extract).not.toHaveBeenCalled();
  });
  it('normalizes usage and remaining quotas without exposing arbitrary headers', async () => {
    const processor: any = {
      extract: jest.fn(async (_b, _m, _c, _g, options) => {
        options.onUsage({ input: 31, output: 7 });
        options.onHeaders({
          get: (name: string) =>
            ({
              'anthropic-ratelimit-input-tokens-remaining': '123',
              authorization: 'never-store',
            }[name] ?? null),
        });
        return { invoices: [], rawResponse: 'canonical' };
      }),
    };
    const result = await new AnthropicDocumentProvider(processor).analyze(
      input,
      'claude-frozen',
    );
    expect(result).toMatchObject({
      usage: { input: 31, output: 7 },
      capacity: { inputRemaining: 123 },
    });
    expect(JSON.stringify(result)).not.toContain('never-store');
    expect(processor.extract.mock.calls[0][4]).toMatchObject({
      model: 'claude-frozen',
      bounded: true,
    });
  });
  it('honors a confirmed rate-limit retry delay', async () => {
    const provider = new AnthropicDocumentProvider({
      extract: jest
        .fn()
        .mockRejectedValue({ status: 429, headers: { get: () => '17' } }),
    } as any);
    await expect(
      provider.analyze(input, 'claude-frozen'),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', retryAfterSeconds: 17 });
  });
  it.each([500, 503, undefined])(
    'does not transparently replay an unknown provider outcome (%s)',
    async (status) => {
      const extract = jest.fn().mockRejectedValue({ status });
      await expect(
        new AnthropicDocumentProvider({ extract } as any).analyze(
          input,
          'claude-frozen',
        ),
      ).rejects.toThrow('AI_UNKNOWN_OUTCOME');
      expect(extract).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects a mismatched provider/model before the SDK', async () => {
    const extract = jest.fn();
    await expect(
      new AnthropicDocumentProvider({ extract } as any).analyze(
        input,
        'fake-openai',
      ),
    ).rejects.toBeInstanceOf(ProviderRejectedError);
    expect(extract).not.toHaveBeenCalled();
  });
});
