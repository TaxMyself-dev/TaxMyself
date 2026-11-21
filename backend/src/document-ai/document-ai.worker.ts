import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DocumentAiStore } from './document-ai.store';
import { DocumentAnalysisExecutor } from './document-ai.executor';
import { capacityProfile, CapacityProfile } from './document-ai.capacity';
import {
  AnalysisInputError,
  AnalysisJob,
  DocumentAiProvider,
  ProviderRejectedError,
  analysisContext,
} from './document-ai.types';
export const DOCUMENT_AI_PROVIDERS = Symbol('DOCUMENT_AI_PROVIDERS');
@Injectable()
export class DocumentAiWorker {
  private readonly logger = new Logger(DocumentAiWorker.name);
  private readonly active = new Set<Promise<void>>();
  private dispatching = false;
  private configurationError = false;
  constructor(
    readonly store: DocumentAiStore,
    readonly executor: DocumentAnalysisExecutor,
    @Inject(DOCUMENT_AI_PROVIDERS) readonly providers: DocumentAiProvider[],
  ) {}
  @Cron('*/2 * * * * *', { name: 'documentAiDispatch' })
  async tick() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const profile = capacityProfile();
      if (!this.providers.some((p) => p.id === profile.provider))
        throw new Error('No configured document AI provider adapter');
      this.configurationError = false;
      let admitted = 0;
      while (
        this.active.size < profile.concurrency &&
        admitted++ < profile.concurrency
      ) {
        const completion = await this.store.claimCompletion();
        const job = completion || (await this.store.claimNext(profile));
        if (!job) break;
        const task = this.run(job, profile)
          .catch(() =>
            this.logger.warn('Document analysis retained for attention'),
          )
          .finally(() => this.active.delete(task));
        this.active.add(task);
      }
    } catch {
      if (!this.configurationError)
        this.logger.warn(
          'Document AI requires reviewed schema, measured capacity and a configured provider; no dispatch performed',
        );
      this.configurationError = true;
    } finally {
      this.dispatching = false;
    }
  }
  /** Test/controlled shutdown synchronization; never starts a worker or provider by itself. */
  async drain() {
    await Promise.all([...this.active]);
  }
  @Cron('*/30 * * * * *', { name: 'documentAiRecovery' })
  async recover() {
    try {
      await this.store.recoverExpired();
      for (const job of await this.store.unreportedGmailFailures())
        await this.executor.recordQueuedFailure?.(job, job.error_code);
      await this.executor.recoverQueuedUploads();
    } catch {
      this.logger.warn('Document analysis recovery retained for retry');
    }
  }
  async run(job: AnalysisJob, profile: CapacityProfile) {
    if (!['PREPARING', 'COMPLETING', 'RESULT_SAVED'].includes(job.state))
      return;
    let lostLease = false;
    const heartbeat = setInterval(
      () =>
        void this.store.heartbeat(job).catch(() => {
          lostLease = true;
        }),
      30000,
    );
    heartbeat.unref?.();
    const started = Date.now();
    const cpu = process.cpuUsage();
    try {
      if (!['COMPLETING', 'RESULT_SAVED'].includes(job.state)) {
        const input = await this.executor.prepareQueuedAnalysis(job, profile);
        if (lostLease) throw new Error('Preparation lease lost');
        if (input.cached) {
          await this.store.patch(job, {
            state: 'RESULT_SAVED',
            result_json: JSON.stringify(input.cached),
            timings_json: JSON.stringify({
              preparationMs: Date.now() - started,
              reused: 1,
            }),
          });
        } else {
          if (
            !(await this.store.admit(
              job,
              profile,
              input.estimatedInput,
              input.estimatedOutput,
            ))
          ) {
            if (job.state === 'BLOCKED')
              await this.executor.recordQueuedFailure?.(job, job.error_code);
            return;
          }
          const provider = this.providers.find((p) => p.id === job.provider);
          if (!provider)
            throw new ProviderRejectedError('PROVIDER_NOT_CONFIGURED');
          const aiStart = Date.now();
          let outcome;
          try {
            outcome = await provider.analyze(input, job.model);
          } catch (error) {
            if (error instanceof ProviderRejectedError) {
              await this.store.rejectBeforeProcessing(
                job,
                profile,
                error.code,
                error.retryAfterSeconds ??
                  Math.min(60, 2 ** Math.min(job.attempts, 6)),
              );
              if (job.state === 'BLOCKED')
                await this.executor.recordQueuedFailure?.(job, error.code);
              return;
            }
            await this.store.patch(job, {
              state: 'UNKNOWN',
              error_code: 'AI_UNKNOWN_OUTCOME',
              lease_token: null,
              lease_expires_at: null,
            });
            await this.executor.recordQueuedFailure?.(
              job,
              'AI_UNKNOWN_OUTCOME',
            );
            return;
          }
          if (lostLease) throw new Error('Paid outcome lease lost');
          const memory = process.memoryUsage(),
            usedCpu = process.cpuUsage(cpu);
          await this.store.saveResult(job, profile, outcome, {
            ...input.timings,
            preparationMs: aiStart - started,
            aiMs: Date.now() - aiStart,
            waitMs: Math.max(0, started - new Date(job.created_at).getTime()),
            processRssBytes: memory.rss,
            processHeapBytes: memory.heapUsed,
            processCpuMicrosDuringJob: usedCpu.user + usedCpu.system,
          });
        }
      }
      await this.store.patch(job, { state: 'COMPLETING' });
      const completing = Date.now();
      const result = await this.executor.completeQueuedAnalysis(
        job,
        analysisContext(job.result_json) as any,
      );
      await this.store.patch(job, {
        state: 'COMPLETED',
        completion_json: JSON.stringify(result),
        timings_json: JSON.stringify({
          ...analysisContext((job as any).timings_json),
          completionMs: Date.now() - completing,
        }),
        ...(job.purpose === 'GMAIL' ? { result_json: null } : {}),
        finished_at: new Date(),
        error_code: null,
        lease_token: null,
        lease_expires_at: null,
      });
    } catch (error) {
      if (lostLease) return;
      if (job.state === 'IN_FLIGHT') {
        await this.store.patch(job, {
          state: 'UNKNOWN',
          error_code: 'AI_UNKNOWN_OUTCOME',
          lease_token: null,
          lease_expires_at: null,
        });
        await this.executor.recordQueuedFailure?.(job, 'AI_UNKNOWN_OUTCOME');
        return;
      }
      const code =
        error instanceof AnalysisInputError ? error.code : 'PROCESSING_RETRY';
      const saved = ['RESULT_SAVED', 'COMPLETING'].includes(job.state);
      await this.store.patch(job, {
        state:
          code === 'PASSWORD_REQUIRED'
            ? 'PASSWORD_REQUIRED'
            : error instanceof AnalysisInputError ||
              (!saved && job.attempts >= 5) ||
              (saved && Number(job.completion_attempts || 0) >= 5)
            ? 'BLOCKED'
            : saved
            ? 'RESULT_SAVED'
            : 'READY',
        error_code: code,
        next_at: new Date(Date.now() + 60000),
        lease_token: null,
        lease_expires_at: null,
      });
      if (['BLOCKED', 'PASSWORD_REQUIRED'].includes(job.state))
        await this.executor.recordQueuedFailure?.(job, code);
    } finally {
      clearInterval(heartbeat);
    }
  }
}
