import { documentExecution } from './document-ai.execution';
import { Injectable } from '@nestjs/common';
import { DocumentProcessorService } from '../documents/document-processor.service';
import {
  AnalysisInput,
  AnalysisOutcome,
  AnalysisUsage,
  DocumentAiProvider,
  ProviderRejectedError,
  ProviderCapacitySnapshot,
} from './document-ai.types';
/** Transport adapter only. Queue state, fairness and recovery never depend on Anthropic SDK shapes. */
@Injectable()
export class AnthropicDocumentProvider implements DocumentAiProvider {
  readonly id = 'anthropic';
  constructor(private readonly processor: DocumentProcessorService) {}
  async analyze(input: AnalysisInput, model: string): Promise<AnalysisOutcome> {
    if (!model.startsWith('claude-'))
      throw new ProviderRejectedError('PROVIDER_MODEL_MISMATCH');
    if (input.beforeAnalyze) {
      try { await input.beforeAnalyze(); }
      catch (error) { throw new ProviderRejectedError(error?.message === 'EMAIL_SENDER_BLOCKED' ? 'EMAIL_SENDER_BLOCKED' : 'EMAIL_RULE_CHECK_UNAVAILABLE'); }
    }
    let usage: AnalysisUsage | undefined;
    let capacity: ProviderCapacitySnapshot | undefined;
    try {
      const result = await this.processor.extract(
        input.bytes,
        input.mimeType,
        input.catalog,
        input.gmailPolicy,
        {
          model,
          onUsage: (value) => {
            usage = value;
          },
          onHeaders: (headers) => {
            const nonnegative = (name: string) => {
              const raw = headers.get(name);
              return raw !== null &&
                raw.trim() !== '' &&
                Number.isFinite(+raw) &&
                +raw >= 0
                ? +raw
                : undefined;
            };
            capacity = {
              requestsRemaining: nonnegative(
                'anthropic-ratelimit-requests-remaining',
              ),
              inputRemaining: nonnegative(
                'anthropic-ratelimit-input-tokens-remaining',
              ),
              outputRemaining: nonnegative(
                'anthropic-ratelimit-output-tokens-remaining',
              ),
            };
            for (const key of ['requests', 'input-tokens', 'output-tokens'])
              if (
                nonnegative('anthropic-ratelimit-' + key + '-remaining') === 0
              ) {
                const reset = Date.parse(
                  headers.get('anthropic-ratelimit-' + key + '-reset') || '',
                );
                if (Number.isFinite(reset))
                  capacity.blockedUntil = Math.max(
                    capacity.blockedUntil || 0,
                    reset,
                  );
              }
          },
          bounded: true,
          signal: documentExecution.getStore(),
        },
      );
      return { ...result, usage, capacity };
    } catch (error: any) {
      const status = Number(error?.status);
      if (status === 429) {
        const raw =
          typeof error?.headers?.get === 'function'
            ? error.headers.get('retry-after')
            : error?.headers?.['retry-after'];
        const seconds =
          raw !== null && raw !== undefined && String(raw).trim() !== ''
            ? Number.isFinite(Number(raw))
              ? Math.max(0, Number(raw))
              : Number.isFinite(Date.parse(raw))
              ? Math.max(0, (Date.parse(raw) - Date.now()) / 1000)
              : undefined
            : undefined;
        throw new ProviderRejectedError('RATE_LIMIT', seconds);
      }
      if ([400, 401, 403, 404, 413, 422].includes(status))
        throw new ProviderRejectedError(
          status === 413
            ? 'PROVIDER_INPUT_LIMIT'
            : 'PROVIDER_REJECTED_' + status,
        );
      // Network errors/timeouts/5xx may have accepted a paid request: no transparent replay.
      throw new Error('AI_UNKNOWN_OUTCOME');
    }
  }
}
