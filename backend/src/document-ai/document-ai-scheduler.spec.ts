import { EventEmitter } from 'events';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DocumentAiWorker } from './document-ai.worker';
import { documentExecution } from './document-ai.execution';
import { DocumentSchedulerController } from './document-ai-scheduler.controller';
import {
  DocumentSchedulerGuard,
  DOCUMENT_SCHEDULER_IDENTITY,
} from './document-ai-scheduler.guard';
const env = {
  DOCUMENT_AI_DISPATCH_MODE: 'scheduler',
  DOCUMENT_AI_SCHEDULER_AUDIENCE: 'https://worker.example',
  DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT:
    'scheduler@project.iam.gserviceaccount.com',
  DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB: '123456789012345678901',
  DOCUMENT_AI_PROVIDER: 'anthropic',
  DOCUMENT_AI_MODEL: 'claude-sonnet-4-6',
  DOCUMENT_AI_LIMIT_GROUP: 'test',
  DOCUMENT_AI_MAX_CONCURRENCY: '2',
  DOCUMENT_AI_RPM: '60',
  DOCUMENT_AI_ITPM: '200000',
  DOCUMENT_AI_OTPM: '100000',
  DOCUMENT_AI_PDF_PAGE_TOKENS: '5000',
  DOCUMENT_AI_IMAGE_TOKENS: '5000',
  DOCUMENT_AI_OUTPUT_ESTIMATE: '8192',
};
function deferred() {
  let resolve: (v?: any) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { promise, resolve };
}
function subject() {
  const store: any = {
    recoverExpired: jest.fn(),
    unreportedGmailFailures: jest.fn().mockResolvedValue([]),
    claimCompletion: jest.fn().mockResolvedValue(null),
    claimNext: jest.fn().mockResolvedValue(null),
    heartbeat: jest.fn().mockResolvedValue(undefined),
    patch: jest.fn(async (j, values) => Object.assign(j, values)),
    admit: jest.fn(async (j) => {
      j.state = 'IN_FLIGHT';
      return true;
    }),
    saveResult: jest.fn(async (j, _p, result) =>
      Object.assign(j, { state: 'RESULT_SAVED', result_json: result }),
    ),
  };
  const executor: any = {
    prepareQueuedAnalysis: jest
      .fn()
      .mockResolvedValue({ estimatedInput: 1, estimatedOutput: 1 }),
    completeQueuedAnalysis: jest.fn().mockResolvedValue({ ok: true }),
    recordQueuedFailure: jest.fn(),
    recoverQueuedUploads: jest.fn().mockResolvedValue(undefined),
  };
  const provider: any = {
    id: 'anthropic',
    analyze: jest.fn().mockResolvedValue({ invoices: [], rawResponse: '' }),
  };
  const worker = new DocumentAiWorker(store, executor, [provider]);
  const job: any = {
    id: '1',
    state: 'PREPARING',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    purpose: 'FORM_FILL',
    attempts: 1,
    lease_token: 'lease',
    created_at: new Date(),
  };
  return { store, executor, provider, worker, job };
}
describe('request-bound document rounds (offline)', () => {
  let previous: NodeJS.ProcessEnv;
  beforeEach(() => {
    previous = { ...process.env };
    Object.assign(process.env, env);
  });
  afterEach(() => {
    process.env = previous;
    jest.useRealTimers();
  });
  it('returns promptly without preparation/AI for empty or not-yet-due work', async () => {
    const t = subject();
    expect(await t.worker.round(new AbortController().signal)).toEqual({
      status: 'completed',
      admitted: 0,
    });
    expect(t.store.recoverExpired).toHaveBeenCalledTimes(1);
    expect(t.provider.analyze).not.toHaveBeenCalled();
    expect(t.executor.prepareQueuedAnalysis).not.toHaveBeenCalled();
  });
  it('refills two slots, ignores local overlap and drains all eligible jobs', async () => {
    const t = subject(),
      gate = deferred(),
      entered = deferred();
    let count = 0;
    t.store.claimNext.mockImplementation(async () =>
      count < 5 ? { ...t.job, id: String(++count) } : null,
    );
    t.provider.analyze.mockImplementation(async () => {
      if (t.provider.analyze.mock.calls.length === 2) entered.resolve();
      await gate.promise;
      return { invoices: [] };
    });
    let finished = false;
    const round = t.worker.round(new AbortController().signal).then((v) => {
      finished = true;
      return v;
    });
    await entered.promise;
    expect(finished).toBe(false);
    expect(await t.worker.round(new AbortController().signal)).toEqual({
      status: 'busy',
      admitted: 0,
    });
    gate.resolve();
    expect(await round).toEqual({ status: 'completed', admitted: 5 });
    expect(count).toBe(5);
    expect(t.executor.completeQueuedAnalysis).toHaveBeenCalledTimes(5);
  });
  it('stops refilling at one minute but drains the last active jobs', async () => {
    jest.useFakeTimers();
    const t = subject(),
      entered = deferred(),
      gate = deferred();
    let active = 0,
      peak = 0;
    t.store.claimNext.mockImplementation(async () => ({ ...t.job }));
    t.provider.analyze.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      if (active === 2) entered.resolve();
      await gate.promise;
      active--;
      return { invoices: [] };
    });
    const round = t.worker.round(new AbortController().signal);
    await entered.promise;
    await jest.advanceTimersByTimeAsync(60000);
    expect(t.provider.analyze).toHaveBeenCalledTimes(2);
    gate.resolve();
    expect(await round).toEqual({ status: 'completed', admitted: 2 });
    expect(peak).toBe(2);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('refills a freed slot without waiting for the slower companion job', async () => {
    const t = subject(),
      first = deferred(),
      second = deferred(),
      entered = deferred(),
      refilled = deferred();
    let n = 0;
    t.store.claimNext.mockImplementation(async () =>
      n < 3 ? { ...t.job, id: String(++n) } : null,
    );
    t.provider.analyze.mockImplementation(async () => {
      const call = t.provider.analyze.mock.calls.length;
      if (call === 2) entered.resolve();
      if (call === 1) await first.promise;
      if (call === 2) await second.promise;
      if (call === 3) refilled.resolve();
      return { invoices: [] };
    });
    const round = t.worker.round(new AbortController().signal);
    await entered.promise;
    first.resolve();
    await refilled.promise;
    expect(t.provider.analyze).toHaveBeenCalledTimes(3);
    second.resolve();
    expect((await round).admitted).toBe(3);
  });
  it('runs bounded maintenance independently from processing and awaits settlement', async () => {
    jest.useFakeTimers();
    const t = subject(),
      entered = deferred(),
      gate = deferred();
    let budget: () => boolean;
    t.executor.recoverQueuedUploads.mockImplementation(async (fn) => {
      budget = fn;
      entered.resolve();
      await gate.promise;
    });
    let finished = false;
    const maintenance = t.worker
      .maintenance(new AbortController().signal)
      .then((v) => {
        finished = true;
        return v;
      });
    await entered.promise;
    expect(budget()).toBe(true);
    expect(await t.worker.maintenance(new AbortController().signal)).toEqual({
      status: 'busy',
    });
    expect((await t.worker.round(new AbortController().signal)).admitted).toBe(
      0,
    );
    await jest.advanceTimersByTimeAsync(60000);
    expect(budget()).toBe(false);
    expect(finished).toBe(false);
    gate.resolve();
    await maintenance;
    expect(t.provider.analyze).not.toHaveBeenCalled();
  });
  it('cancels and drains maintenance during shutdown', async () => {
    const t = subject(),
      entered = deferred(),
      gate = deferred();
    let signal: AbortSignal;
    t.executor.recoverQueuedUploads.mockImplementation(async () => {
      signal = documentExecution.getStore();
      entered.resolve();
      await gate.promise;
    });
    const maintenance = t.worker.maintenance(new AbortController().signal);
    await entered.promise;
    let stopped = false;
    const stop = t.worker.beforeApplicationShutdown().then(() => {
      stopped = true;
    });
    expect(signal.aborted).toBe(true);
    expect(stopped).toBe(false);
    gate.resolve();
    await stop;
    expect((await maintenance).status).toBe('cancelled');
  });
  it('drains already-started work if a later claim fails', async () => {
    const t = subject(),
      gate = deferred(),
      entered = deferred();
    t.store.claimNext
      .mockResolvedValueOnce(t.job)
      .mockRejectedValueOnce(new Error('storage'));
    t.provider.analyze.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return { invoices: [] };
    });
    let finished = false;
    const round = t.worker.round(new AbortController().signal).catch((e) => {
      finished = true;
      return e;
    });
    await entered.promise;
    expect(finished).toBe(false);
    gate.resolve();
    expect((await round).getStatus()).toBe(503);
    expect(t.job.state).toBe('COMPLETED');
  });
  it('does not call AI when preparation finishes after cancellation', async () => {
    const t = subject(),
      gate = deferred(),
      entered = deferred(),
      abort = new AbortController();
    t.store.claimNext.mockResolvedValueOnce(t.job).mockResolvedValue(null);
    t.executor.prepareQueuedAnalysis.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return {};
    });
    const round = t.worker.round(abort.signal);
    await entered.promise;
    abort.abort();
    gate.resolve();
    expect((await round).status).toBe('cancelled');
    expect(t.provider.analyze).not.toHaveBeenCalled();
    expect(t.job.state).toBe('READY');
  });
  it('cancels in-flight AI on shutdown and retains UNKNOWN without replay', async () => {
    const t = subject(),
      entered = deferred();
    t.store.claimNext.mockResolvedValueOnce(t.job).mockResolvedValue(null);
    t.provider.analyze.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          documentExecution
            .getStore()
            .addEventListener('abort', () => reject(new Error('cancelled')), {
              once: true,
            });
          entered.resolve();
        }),
    );
    const round = t.worker.round(new AbortController().signal);
    await entered.promise;
    await t.worker.beforeApplicationShutdown();
    expect((await round).status).toBe('cancelled');
    expect(t.job.state).toBe('UNKNOWN');
    expect(t.provider.analyze).toHaveBeenCalledTimes(1);
    await expect(t.worker.round(new AbortController().signal)).rejects.toThrow(
      'stopping',
    );
  });
  it('keeps saved completion retryable without another AI call after cancellation', async () => {
    const t = subject(),
      entered = deferred(),
      gate = deferred(),
      abort = new AbortController();
    t.store.claimNext.mockResolvedValueOnce(t.job).mockResolvedValue(null);
    t.store.saveResult.mockImplementation(async (j, _p, result) => {
      Object.assign(j, { state: 'RESULT_SAVED', result_json: result });
      entered.resolve();
      await gate.promise;
    });
    const round = t.worker.round(abort.signal);
    await entered.promise;
    abort.abort();
    gate.resolve();
    await round;
    expect(t.job.state).toBe('RESULT_SAVED');
    expect(t.executor.completeQueuedAnalysis).not.toHaveBeenCalled();
  });
  it('awaits an outstanding heartbeat before returning', async () => {
    jest.useFakeTimers();
    const t = subject(),
      gate = deferred(),
      heartbeat = deferred(),
      entered = deferred();
    t.store.claimNext.mockResolvedValueOnce(t.job).mockResolvedValue(null);
    t.store.heartbeat.mockReturnValue(heartbeat.promise);
    t.provider.analyze.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return { invoices: [] };
    });
    let finished = false;
    const round = t.worker.round(new AbortController().signal).then(() => {
      finished = true;
    });
    await entered.promise;
    await jest.advanceTimersByTimeAsync(30000);
    gate.resolve();
    await jest.advanceTimersByTimeAsync(1);
    expect(finished).toBe(false);
    heartbeat.resolve();
    await round;
    expect(finished).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('honors shared quota refusal and never calls AI without admission', async () => {
    const t = subject();
    t.store.claimNext.mockResolvedValueOnce(t.job).mockResolvedValue(null);
    t.store.admit.mockResolvedValue(false);
    await t.worker.round(new AbortController().signal);
    expect(t.provider.analyze).not.toHaveBeenCalled();
  });
  it('awaits recovery during shutdown even before any job has started', async () => {
    const t = subject(),
      gate = deferred(),
      entered = deferred();
    t.store.recoverExpired.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
    });
    const round = t.worker.round(new AbortController().signal);
    await entered.promise;
    let stopped = false;
    const stop = t.worker.beforeApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    gate.resolve();
    await stop;
    await round;
    expect(t.provider.analyze).not.toHaveBeenCalled();
    expect(stopped).toBe(true);
  });
  it('never starts AI after a preparation heartbeat loses its lease', async () => {
    jest.useFakeTimers();
    const t = subject(),
      gate = deferred(),
      entered = deferred();
    t.store.claimNext.mockResolvedValueOnce(t.job).mockResolvedValue(null);
    t.store.heartbeat.mockRejectedValue(new Error('fence changed'));
    t.executor.prepareQueuedAnalysis.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return {};
    });
    const round = t.worker.round(new AbortController().signal);
    await entered.promise;
    await jest.advanceTimersByTimeAsync(30000);
    gate.resolve();
    await round;
    expect(t.provider.analyze).not.toHaveBeenCalled();
    expect(t.store.patch).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('suppresses detached dispatch/recovery cron in Scheduler mode', async () => {
    const t = subject();
    await t.worker.tick();
    await t.worker.recover();
    expect(t.store.claimNext).not.toHaveBeenCalled();
    expect(t.store.recoverExpired).not.toHaveBeenCalled();
  });
  it('rejects capacity configuration above two', async () => {
    process.env.DOCUMENT_AI_MAX_CONCURRENCY = '3';
    await expect(
      subject().worker.round(new AbortController().signal),
    ).rejects.toThrow('retained');
  });
});
describe('Scheduler HTTP authorization', () => {
  let app: INestApplication, previous: NodeJS.ProcessEnv;
  const worker = {
    round: jest.fn().mockResolvedValue({ admitted: 0 }),
    maintenance: jest.fn().mockResolvedValue({ status: 'completed' }),
  };
  const claims = () => ({
    aud: env.DOCUMENT_AI_SCHEDULER_AUDIENCE,
    email: env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT,
    sub: env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB,
    email_verified: true,
    iss: 'https://accounts.google.com',
    exp: Date.now() / 1000 + 60,
  });
  const verify = jest.fn();
  beforeAll(async () => {
    previous = { ...process.env };
    Object.assign(process.env, env);
    const module = await Test.createTestingModule({
      controllers: [DocumentSchedulerController],
      providers: [
        DocumentSchedulerGuard,
        { provide: DocumentAiWorker, useValue: worker },
        { provide: DOCUMENT_SCHEDULER_IDENTITY, useValue: { verify } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    Object.assign(process.env, env);
    verify.mockReset().mockResolvedValue(claims());
    worker.round.mockClear();
  });
  afterAll(async () => {
    await app.close();
    process.env = previous;
  });
  it('rejects missing and malformed headers before executing work', async () => {
    await request(app.getHttpServer())
      .post('/internal/document-ai/round')
      .expect(401);
    await request(app.getHttpServer())
      .post('/internal/document-ai/round')
      .set('Authorization', 'Basic token')
      .expect(401);
    expect(verify).not.toHaveBeenCalled();
    expect(worker.round).not.toHaveBeenCalled();
  });
  it.each(['aud', 'email', 'sub', 'iss', 'email_verified', 'exp'])(
    'rejects mismatched %s',
    async (field) => {
      verify.mockResolvedValue({
        ...claims(),
        [field]:
          field === 'exp' ? 0 : field === 'email_verified' ? false : 'wrong',
      });
      await request(app.getHttpServer())
        .post('/internal/document-ai/round')
        .set('Authorization', 'Bearer synthetic')
        .expect(401);
      expect(worker.round).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid signatures and a disabled mode', async () => {
    verify.mockRejectedValue(new Error('signature'));
    await request(app.getHttpServer())
      .post('/internal/document-ai/round')
      .set('Authorization', 'Bearer synthetic')
      .expect(401);
    process.env.DOCUMENT_AI_DISPATCH_MODE = 'cron';
    verify.mockResolvedValue(claims());
    await request(app.getHttpServer())
      .post('/internal/document-ai/round')
      .set('Authorization', 'Bearer synthetic')
      .expect(401);
  });
  it('accepts only the configured verified service identity and audience', async () => {
    await request(app.getHttpServer())
      .post('/internal/document-ai/round')
      .set('Authorization', 'Bearer synthetic')
      .expect(200);
    expect(verify).toHaveBeenCalledWith(
      'synthetic',
      env.DOCUMENT_AI_SCHEDULER_AUDIENCE,
    );
    expect(worker.round).toHaveBeenCalledTimes(1);
  });
  it('requires the same verified service identity for the maintenance route', async () => {
    worker.maintenance.mockClear();
    await request(app.getHttpServer())
      .post('/internal/document-ai/maintenance')
      .expect(401);
    verify.mockResolvedValue({ ...claims(), sub: 'wrong' });
    await request(app.getHttpServer())
      .post('/internal/document-ai/maintenance')
      .set('Authorization', 'Bearer synthetic')
      .expect(401);
    expect(worker.maintenance).not.toHaveBeenCalled();
    verify.mockResolvedValue(claims());
    await request(app.getHttpServer())
      .post('/internal/document-ai/maintenance')
      .set('Authorization', 'Bearer synthetic')
      .expect(200);
    expect(worker.maintenance).toHaveBeenCalledTimes(1);
  });
  it('fails startup closed for missing identity configuration', () => {
    delete process.env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB;
    expect(() => new DocumentSchedulerGuard({ verify }).onModuleInit()).toThrow(
      'requires exact',
    );
  });
});
describe('controller cancellation and listener ownership', () => {
  it('recognizes a client that disconnected while authentication was pending', async () => {
    const req = Object.assign(new EventEmitter(), { aborted: true }),
      res = new EventEmitter();
    const worker = {
      round: jest.fn(async (signal: AbortSignal) => {
        expect(signal.aborted).toBe(true);
        return { admitted: 0 };
      }),
    };
    await new DocumentSchedulerController(worker as any).round(
      req as any,
      res as any,
    );
    expect(worker.round).toHaveBeenCalledTimes(1);
    expect(req.listenerCount('aborted')).toBe(0);
  });
  afterEach(() => jest.useRealTimers());
  it.each(['deadline', 'disconnect', 'aborted'])(
    'waits for round settlement after %s',
    async (reason) => {
      jest.useFakeTimers();
      const req = new EventEmitter(),
        res = new EventEmitter(),
        gate = deferred();
      let signal: AbortSignal;
      const controller = new DocumentSchedulerController({
        round: jest.fn(async (s) => {
          signal = s;
          await gate.promise;
          return { status: 'cancelled' };
        }),
      } as any);
      let finished = false;
      const result = controller.round(req as any, res as any).then(() => {
        finished = true;
      });
      if (reason === 'deadline') await jest.advanceTimersByTimeAsync(120000);
      else if (reason === 'disconnect') res.emit('close');
      else req.emit('aborted');
      expect(signal.aborted).toBe(true);
      expect(finished).toBe(false);
      gate.resolve();
      await result;
      expect(req.listenerCount('aborted')).toBe(0);
      expect(res.listenerCount('close')).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
