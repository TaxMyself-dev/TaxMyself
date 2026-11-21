import { DocumentAiWorker } from './document-ai.worker';
import { AnalysisJob, ProviderRejectedError } from './document-ai.types';
import { CapacityProfile } from './document-ai.capacity';
const profile: CapacityProfile = {
  provider: 'anthropic',
  model: 'claude-current',
  key: 'test',
  concurrency: 8,
  rpm: 60,
  itpm: 60000,
  otpm: 6000,
  pdfPageTokens: 1000,
  imageTokens: 1000,
  outputEstimate: 100,
};
function subject(state = 'PREPARING') {
  const job = {
    id: 'job',
    owner: 'owner',
    business: 'business',
    provider: 'anthropic',
    model: 'claude-frozen',
    capacity_key: 'test',
    state,
    lease_token: 'lease',
    attempts: 1,
    created_at: new Date(),
    result_json: { invoices: [], rawResponse: 'saved' },
  } as any as AnalysisJob;
  const store: any = {
    patch: jest.fn(async (j: any, v: any) => Object.assign(j, v)),
    heartbeat: jest.fn(),
    admit: jest.fn(async (j: any) => {
      j.state = 'IN_FLIGHT';
      return true;
    }),
    saveResult: jest.fn(async (j: any, _p: any, outcome: any) =>
      Object.assign(j, { state: 'RESULT_SAVED', result_json: outcome }),
    ),
    rejectBeforeProcessing: jest.fn(),
    claimCompletion: jest.fn().mockResolvedValue(null),
    claimNext: jest.fn().mockResolvedValue(null),
  };
  const input = {
    bytes: Buffer.from('synthetic'),
    mimeType: 'application/pdf',
    catalog: [],
    gmailPolicy: true,
    estimatedInput: 100,
    estimatedOutput: 100,
  };
  const executor: any = {
    prepareQueuedAnalysis: jest.fn().mockResolvedValue(input),
    completeQueuedAnalysis: jest.fn().mockResolvedValue({ documentId: 7 }),
    recoverQueuedUploads: jest.fn(),
  };
  const provider: any = {
    id: 'anthropic',
    analyze: jest
      .fn()
      .mockResolvedValue({ invoices: [], rawResponse: 'result' }),
  };
  const worker = new DocumentAiWorker(store, executor, [provider]);
  return { job, store, input, executor, provider, worker };
}
describe('shared document worker (no real provider)', () => {
  it('eventually drains 300 synthetic jobs without exceeding configured concurrency', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      DOCUMENT_AI_LIMIT_GROUP: 'test',
      DOCUMENT_AI_MAX_CONCURRENCY: '8',
      DOCUMENT_AI_RPM: '60',
      DOCUMENT_AI_ITPM: '60000',
      DOCUMENT_AI_OTPM: '6000',
      DOCUMENT_AI_PDF_PAGE_TOKENS: '1000',
      DOCUMENT_AI_IMAGE_TOKENS: '1000',
      DOCUMENT_AI_OUTPUT_ESTIMATE: '100',
    });
    const t = subject(),
      jobs = Array.from({ length: 300 }, (_, i) => ({
        ...t.job,
        id: String(i),
      }));
    let active = 0,
      peak = 0;
    t.store.claimNext.mockImplementation(async () => jobs.shift() || null);
    t.provider.analyze.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return { invoices: [], rawResponse: 'synthetic' };
    });
    try {
      for (let i = 0; i < 40 && jobs.length; i++) {
        await t.worker.tick();
        await t.worker.drain();
      }
      expect(jobs).toHaveLength(0);
      expect(t.provider.analyze).toHaveBeenCalledTimes(300);
      expect(peak).toBe(8);
    } finally {
      process.env = saved;
    }
  });
  it('uses the frozen job model and saves the result before completing the workflow', async () => {
    const t = subject();
    await t.worker.run(t.job, profile);
    expect(t.provider.analyze).toHaveBeenCalledWith(t.input, 'claude-frozen');
    expect(t.store.saveResult.mock.invocationCallOrder[0]).toBeLessThan(
      t.executor.completeQueuedAnalysis.mock.invocationCallOrder[0],
    );
    expect(t.job.state).toBe('COMPLETED');
  });
  it('retains unknown outcomes and does not replay them', async () => {
    const t = subject();
    t.provider.analyze.mockRejectedValue(new Error('timeout'));
    await t.worker.run(t.job, profile);
    expect(t.job.state).toBe('UNKNOWN');
    await t.worker.run(t.job, profile);
    expect(t.provider.analyze).toHaveBeenCalledTimes(1);
    expect(t.executor.completeQueuedAnalysis).not.toHaveBeenCalled();
  });
  it('resumes a saved result without another extraction', async () => {
    const t = subject('COMPLETING');
    await t.worker.run(t.job, profile);
    expect(t.provider.analyze).not.toHaveBeenCalled();
    expect(t.executor.prepareQueuedAnalysis).not.toHaveBeenCalled();
    expect(t.job.state).toBe('COMPLETED');
  });
  it('retains saved results after completion failure and reuses them on retry', async () => {
    const t = subject('COMPLETING');
    t.executor.completeQueuedAnalysis.mockRejectedValueOnce(
      new Error('Drive busy'),
    );
    await t.worker.run(t.job, profile);
    expect(t.job.state).toBe('RESULT_SAVED');
    await t.worker.run(t.job, profile);
    expect(t.provider.analyze).not.toHaveBeenCalled();
    expect(t.job.state).toBe('COMPLETED');
  });
  it('does not call the provider before request/token admission', async () => {
    const t = subject();
    t.store.admit.mockResolvedValue(false);
    await t.worker.run(t.job, profile);
    expect(t.provider.analyze).not.toHaveBeenCalled();
  });
  it('releases known rejected requests using Retry-After rather than marking them unknown', async () => {
    const t = subject();
    t.provider.analyze.mockRejectedValue(
      new ProviderRejectedError('RATE_LIMIT', 17),
    );
    await t.worker.run(t.job, profile);
    expect(t.store.rejectBeforeProcessing).toHaveBeenCalledWith(
      t.job,
      profile,
      'RATE_LIMIT',
      17,
    );
    expect(t.store.saveResult).not.toHaveBeenCalled();
  });
  it('can use another registered provider without changing the queue or frozen model', async () => {
    const t = subject();
    t.job.provider = 'openai';
    t.job.model = 'fake-openai-model';
    const provider = {
      id: 'openai',
      analyze: jest
        .fn()
        .mockResolvedValue({ invoices: [], rawResponse: 'canonical' }),
    };
    await new DocumentAiWorker(t.store, t.executor, [provider]).run(t.job, {
      ...profile,
      provider: 'openai',
    });
    expect(provider.analyze).toHaveBeenCalledWith(t.input, 'fake-openai-model');
    expect(t.job.state).toBe('COMPLETED');
  });
  it('fills the entire configured capacity from one business', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      DOCUMENT_AI_LIMIT_GROUP: 'test',
      DOCUMENT_AI_MAX_CONCURRENCY: '8',
      DOCUMENT_AI_RPM: '60',
      DOCUMENT_AI_ITPM: '60000',
      DOCUMENT_AI_OTPM: '6000',
      DOCUMENT_AI_PDF_PAGE_TOKENS: '1000',
      DOCUMENT_AI_IMAGE_TOKENS: '1000',
      DOCUMENT_AI_OUTPUT_ESTIMATE: '100',
    });
    const t = subject();
    let release: () => void;
    const gate = new Promise<void>((r) => (release = r));
    t.executor.prepareQueuedAnalysis.mockImplementation(async () => {
      await gate;
      return t.input;
    });
    const jobs = Array.from({ length: 8 }, (_, i) => ({
      ...t.job,
      id: String(i),
    }));
    t.store.claimNext.mockImplementation(async () => jobs.shift() || null);
    try {
      await t.worker.tick();
      expect(t.executor.prepareQueuedAnalysis).toHaveBeenCalledTimes(8);
      release();
      await t.worker.drain();
      expect(t.provider.analyze).toHaveBeenCalledTimes(8);
    } finally {
      release?.();
      process.env = saved;
    }
  });
});
