import { OnboardingExtractor } from './onboarding.extractor';
describe('onboarding conversation model contract', () => {
  let request: jest.SpyInstance;
  let key: string | undefined;
  beforeEach(() => {
    key = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-only';
    request = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    request.mockRestore();
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  });
  function respond(content: unknown) {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(content) },
          },
        ],
      }),
    } as any);
  }
  it('extracts grounded facts independently of response planning and resolves evidence IDs', async () => {
    respond({
      facts: [{ statement: 'שמואל', evidence: ['source-0'] }],
      clarification: null,
      reply: 'נעים להכיר, שמואל.',
    });
    const result: any = await new OnboardingExtractor().extract('אני שמואל', {
      turns: [],
    });
    expect(result.reply).toContain('שמואל');
    expect(result.facts[0].evidence).toEqual(['אני שמואל']);
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.response_format.json_schema.schema.required).not.toContain(
      'reply',
    );
  });
  it('requests one narrative with no recording metadata or duplicated summaries', async () => {
    respond({ story: 'קוראים לך שמואל, אתה עצמאי וגם שכיר.' });
    expect(await new OnboardingExtractor().summarize({ facts: [] })).toContain(
      'קוראים לך שמואל',
    );
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('ONE coherent');
    expect(body.messages[0].content).toContain('only for a real transition');
  });
  it('rejects empty or malformed model narratives rather than showing raw stored data', async () => {
    respond({ story: '' });
    await expect(new OnboardingExtractor().summarize({})).rejects.toThrow();
  });
  it('fails safely on a truncated model answer', async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: 'length', message: { content: '{}' } }],
      }),
    } as any);
    await expect(
      new OnboardingExtractor().extract('שלום', {}),
    ).rejects.toThrow();
  });
  it('enforces the main-agent redirect even if an off-topic model response includes advice', async () => {
    respond({ kind: 'off_topic', reply: 'נסה הגדרות > סיסמה' });
    const result = await new OnboardingExtractor().respond(
      'איך משנים סיסמה?',
      {},
    );
    expect(result.reply).toContain('לסוכן הראשי');
    expect(result.reply).not.toContain('הגדרות');
  });
  it('renders the selected canonical question and returns its matching field identity', async () => {
    respond({ kind: 'conversation', reply: 'הבנתי.', nextField: 'employees' });
    const result = await new OnboardingExtractor().respond('רכב פרטי גם בעסק', {
      intent: 'share',
      missingQuestions: [{ key: 'employees' }],
    });
    expect(result.askedField).toBe('employees');
    expect(result.reply).toBe('הבנתי.\n\nהאם העסק מעסיק עובדים?');
  });
  it('cannot silently ask a different question than the stored field', async () => {
    respond({
      kind: 'conversation',
      reply: 'האם אתה עובד כשכיר?',
      nextField: 'employees',
    });
    const result = await new OnboardingExtractor().respond('רכב', {
      intent: 'share',
      missingQuestions: [{ key: 'employees' }],
    });
    expect(result.reply).not.toContain('שכיר');
    expect(result.reply).toContain('מעסיק עובדים');
    expect(result.askedField).toBe('employees');
  });
});
