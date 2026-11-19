import { Logger } from '@nestjs/common';
import {
  OnboardingTracing,
  localOnboardingTraceConfig,
  maskOnboardingTrace,
} from './onboarding.tracing';
import { OnboardingExtractor } from './onboarding.extractor';
import { OnboardingService } from './onboarding.service';

describe('local onboarding tracing', () => {
  let previous: NodeJS.ProcessEnv;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    previous = { ...process.env };
    Object.assign(process.env, {
      AGENT_ONBOARDING_ENABLED: 'true',
      LANGFUSE_BASE_URL: 'http://localhost:3100',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test-only',
      LANGFUSE_SECRET_KEY: 'sk-lf-test-only',
      LANGFUSE_SAMPLE_RATE: '1',
      LANGFUSE_ONBOARDING_ENABLED: 'true',
    });
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = previous;
    jest.restoreAllMocks();
  });
  function setup(response: any = { ok: true, json: async () => ({}) }) {
    const transport = jest.fn().mockResolvedValue(response);
    return { transport, tracing: new OnboardingTracing(transport as any) };
  }
  function spans(transport: jest.Mock) {
    return JSON.parse(transport.mock.calls[0][1].body).resourceSpans[0]
      .scopeSpans[0].spans;
  }
  function attr(span: any, key: string) {
    return span.attributes.find((a) => a.key === key)?.value.stringValue;
  }

  it.each([
    'https://cloud.langfuse.com',
    'http://localhost.evil:3100',
    'http://127.0.0.1.evil:3100',
    'http://user:pass@localhost:3100',
    'file:///tmp/traces',
  ])('never exports onboarding to %s even with remote opt-in', (url) => {
    process.env.LANGFUSE_BASE_URL = url;
    process.env.LANGFUSE_ALLOW_REMOTE = 'true';
    process.env.LANGFUSE_TRACING_ENVIRONMENT = 'production';
    expect(localOnboardingTraceConfig()).toBeNull();
  });
  it('exports full per-stage IO with shared trace/session context and parent hierarchy', async () => {
    const { tracing, transport } = setup();
    const output = await tracing.run(
      'onboarding.propose',
      { message: 'מהבית' },
      async () => {
        tracing.record(
          'answer.route',
          { question: 'מאיפה אתה עובד?' },
          { pendingField: 'workplace' },
        );
        return tracing.run('facts.validate', { facts: ['עובד מהבית'] }, () => ({
          accepted: true,
        }));
      },
      { userId: 'owner', businessNumber: '111', proposalId: 'proposal' },
    );
    expect(output).toEqual({ accepted: true });
    await tracing.flush();
    const all = spans(transport),
      root = all.find((s) => s.name === 'onboarding.propose');
    expect(all).toHaveLength(3);
    expect(new Set(all.map((s) => s.traceId)).size).toBe(1);
    expect(JSON.parse(attr(root, 'langfuse.observation.input'))).toEqual({
      message: 'מהבית',
    });
    expect(JSON.parse(attr(root, 'langfuse.observation.output'))).toEqual({
      accepted: true,
    });
    for (const child of all.filter((s) => s !== root)) {
      expect(child.parentSpanId).toBe(root.spanId);
      expect(attr(child, 'langfuse.session.id')).toBe('onboarding:owner:111');
    }
    expect(transport.mock.calls[0][0]).toBe(
      'http://localhost:3100/api/public/otel/v1/traces',
    );
    expect(transport.mock.calls[0][1].redirect).toBe('error');
    expect(
      transport.mock.calls[0][1].headers['x-langfuse-ingestion-version'],
    ).toBe('4');
  });
  it('keeps concurrent users in separate traces', async () => {
    const { tracing, transport } = setup();
    let release: () => void;
    const wait = new Promise<void>((resolve) => (release = resolve));
    const first = tracing.run(
      'first',
      { user: 'a' },
      async () => {
        await wait;
        tracing.record('route', {}, 'a');
        return 'a';
      },
      { userId: 'a' },
    );
    await tracing.run(
      'second',
      { user: 'b' },
      () => {
        tracing.record('route', {}, 'b');
        return 'b';
      },
      { userId: 'b' },
    );
    release();
    await first;
    await tracing.flush();
    expect(transport).toHaveBeenCalledTimes(2);
    const batches = transport.mock.calls.map(
      (c) => JSON.parse(c[1].body).resourceSpans[0].scopeSpans[0].spans,
    );
    expect(new Set(batches[0].map((s) => s.traceId)).size).toBe(1);
    expect(batches[0][0].traceId).not.toBe(batches[1][0].traceId);
    for (const batch of batches)
      expect(new Set(batch.map((s) => attr(s, 'langfuse.user.id'))).size).toBe(
        1,
      );
  });
  it('records model request, raw response and token usage without auth headers', async () => {
    const { tracing, transport } = setup();
    process.env.OPENAI_API_KEY = 'sk-openai-test-secret';
    const raw = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              facts: [],
              clarification: null,
              intent: 'recall',
              deferredField: null,
              forgetIds: [],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
    };
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => raw } as any);
    await tracing.run('request', { message: 'מה אתה יודע?' }, () =>
      new OnboardingExtractor().extract('מה אתה יודע?', {
        fields: [],
        activeFacts: [],
        history: [],
      }),
    );
    await tracing.flush();
    const generation = spans(transport).find((s) => s.name === 'model.extract');
    expect(attr(generation, 'langfuse.observation.type')).toBe('generation');
    expect(
      JSON.parse(attr(generation, 'langfuse.observation.input')).messages,
    ).toHaveLength(2);
    expect(JSON.parse(attr(generation, 'langfuse.observation.output'))).toEqual(
      raw,
    );
    expect(
      JSON.parse(attr(generation, 'langfuse.observation.usage_details')),
    ).toEqual({ input: 12, output: 7, total: 19 });
    expect(transport.mock.calls[0][1].body).not.toContain(
      process.env.OPENAI_API_KEY,
    );
  });
  it('traces deterministic short-answer routing and persistence without a model generation', async () => {
    const { tracing, transport } = setup();
    const extractor = { extract: jest.fn(), respond: jest.fn() };
    const service = new OnboardingService(
      { query: jest.fn().mockResolvedValue([]) } as any,
      { ownerBusinesses: async () => [{ businessNumber: '111' }] } as any,
      extractor as any,
    );
    jest.spyOn(service, 'read').mockResolvedValue({
      businessNumber: '111',
      version: { person: 1, business: 1 },
      story: {},
      fields: [
        {
          key: 'employees',
          state: 'unasked',
          question: 'האם העסק מעסיק עובדים?',
        },
        { key: 'partners', state: 'unasked', question: 'האם יש שותפים בעסק?' },
      ],
      facts: [],
      turns: [
        { assistant_text: 'האם העסק מעסיק עובדים?', asked_field: 'employees' },
      ],
    } as any);
    const user = { firebaseId: 'owner', actorFirebaseId: 'owner' } as any;
    const proposal = await tracing.run(
      'test-request',
      {},
      () =>
        service.propose(user, {
          businessNumber: '111',
          version: { person: 1, business: 1 },
          message: 'לא',
        }),
      { userId: 'owner' },
    );
    expect(proposal.facts[0].field).toBe('employees');
    await tracing.flush();
    const all = spans(transport);
    expect(all.map((s) => s.name)).toEqual(
      expect.arrayContaining([
        'answer.route',
        'facts.accepted',
        'response.ready',
        'proposal.persist',
      ]),
    );
    expect(all.some((s) => s.name.startsWith('model.'))).toBe(false);
    expect(
      JSON.parse(
        attr(
          all.find((s) => s.name === 'response.ready'),
          'langfuse.observation.output',
        ),
      ).askedField,
    ).toBe('partners');
    expect(extractor.extract).not.toHaveBeenCalled();
  });
  it('tracing failures cannot change successful results or swallow real application errors', async () => {
    const { tracing, transport } = setup();
    transport.mockRejectedValue(new Error('offline'));
    expect(await tracing.run('success', {}, () => 42)).toBe(42);
    await tracing.flush();
    expect(warn).toHaveBeenCalled();
    const error = new Error('APPLICATION_FAILURE');
    await expect(
      tracing.run('failure', {}, () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await tracing.flush();
  });
  it('exports stage failures as errors while preserving the original exception', async () => {
    const { tracing, transport } = setup();
    await expect(
      tracing.run('failed', {}, () => {
        throw new Error('BAD_MODEL_OUTPUT');
      }),
    ).rejects.toThrow('BAD_MODEL_OUTPUT');
    await tracing.flush();
    const span = spans(transport)[0];
    expect(span.status.code).toBe(2);
    expect(attr(span, 'langfuse.observation.level')).toBe('ERROR');
  });
  it('disabled or unsampled requests never create orphan child traces', async () => {
    const { tracing, transport } = setup();
    process.env.LANGFUSE_SAMPLE_RATE = '0.5';
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    await tracing.run('root', {}, () => tracing.run('child', {}, () => true));
    await tracing.flush();
    expect(transport).not.toHaveBeenCalled();
    process.env.LANGFUSE_ONBOARDING_ENABLED = 'false';
    expect(localOnboardingTraceConfig()).toBeNull();
  });
  it('masks phones, email and credentials without losing business context', () => {
    const result: any = maskOnboardingTrace({
      name: 'שמואל',
      activity: 'תוכנה',
      text: 'test@example.com 050-123-4567 sk-abcdefghi',
      authorization: 'Basic secret',
      nested: { password: 'secret' },
    });
    expect(result.name).toBe('שמואל');
    expect(result.activity).toBe('תוכנה');
    expect(JSON.stringify(result)).not.toMatch(
      /test@example.com|050-123|abcdefghi|Basic secret|"secret"/,
    );
  });
  it('cannot fail a completed operation when its debug value is unserializable', async () => {
    const { tracing, transport } = setup();
    const output = Object.defineProperty({}, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter');
      },
    });
    expect(await tracing.run('success', {}, () => output)).toBe(output);
    await tracing.flush();
    expect(attr(spans(transport)[0], 'langfuse.observation.output')).toContain(
      'unserializable',
    );
  });
});
