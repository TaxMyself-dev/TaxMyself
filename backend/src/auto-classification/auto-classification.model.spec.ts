import { AutoClassificationModel } from './auto-classification.model';
import { KEEPINTAX_AGENT_MODEL_ID } from '../agent-harness/agent-model.config';
describe('automatic classification shared Luna model', () => {
  const old = process.env.OPENAI_API_KEY;
  afterEach(() => {
    jest.restoreAllMocks();
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  });
  const decision = {
    assessment: {
      purchaseKnown: true,
      purpose: 'business',
      purposeEvidence: 'לעסק בלבד',
      permanentRuleSupported: true,
      uncertainties: [],
    },
    kind: 'rule',
    subCategoryId: 1,
    reason: 'מפורש',
    question: null,
  };
  const complete = (content: any[]) => ({
    status: 'completed',
    output: [
      { type: 'reasoning' },
      { type: 'message', status: 'completed', content },
    ],
  });
  function mock(body: any) {
    process.env.OPENAI_API_KEY = 'test';
    return jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => body } as any);
  }
  it('makes no request without a key', async () => {
    delete process.env.OPENAI_API_KEY;
    const request = jest.spyOn(global, 'fetch');
    await expect(new AutoClassificationModel().decide({}, [1])).rejects.toThrow(
      'MODEL_NOT_CONFIGURED',
    );
    expect(request).not.toHaveBeenCalled();
  });
  it('uses the shared Luna ID and bounded private structured Responses request', async () => {
    const request = mock(
      complete([{ type: 'output_text', text: JSON.stringify(decision) }]),
    );
    const result = await new AutoClassificationModel().decide(
      {
        profile: { business: 'לעסק בלבד' },
        categories: [{ id: 1, private: false }],
      },
      [1],
    );
    expect(result.kind).toBe('rule');
    expect(request.mock.calls[0][0]).toBe(
      'https://api.openai.com/v1/responses',
    );
    const body = JSON.parse(request.mock.calls[0][1].body as string);
    expect(body.model).toBe(KEEPINTAX_AGENT_MODEL_ID);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.store).toBe(false);
    expect(body.reasoning.effort).toBe('low');
    expect(body.max_output_tokens).toBe(2400);
    expect(body.input[0].content).toContain('ANY doubt');
    expect(body.text.format.strict).toBe(true);
    expect(
      body.text.format.schema.properties.subCategoryId.anyOf[0].enum,
    ).toEqual([1]);
  });
  it.each(['incomplete', 'failed'])('refuses %s responses', async (status) => {
    mock({ status, output: [] });
    await expect(new AutoClassificationModel().decide({}, [1])).rejects.toThrow(
      'MODEL_INCOMPLETE',
    );
  });
  it('refuses explicit model refusal', async () => {
    mock(complete([{ type: 'refusal', refusal: 'no' }]));
    await expect(new AutoClassificationModel().decide({}, [1])).rejects.toThrow(
      'MODEL_INCOMPLETE',
    );
  });
  it('refuses a completed response with no text', async () => {
    mock(complete([{ type: 'output_text', text: '' }]));
    await expect(new AutoClassificationModel().decide({}, [1])).rejects.toThrow(
      'MODEL_INCOMPLETE',
    );
  });
  it('does not send oversized input or truncate its evidence', async () => {
    const request = jest.spyOn(global, 'fetch');
    expect(
      (
        await new AutoClassificationModel().decide(
          { note: 'x'.repeat(80001) },
          [1],
        )
      ).kind,
    ).toBe('clarify');
    expect(request).not.toHaveBeenCalled();
  });
});
