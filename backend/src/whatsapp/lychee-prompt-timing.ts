import { lycheeLog, safeLycheeError } from './lychee-log';
import { PromptDeliveryError } from './lychee-prompt-diagnostic';

/** Timing only: never wrap an exception, expose a result or retry an operation. */
export async function timePromptStage<T>(
  eventId: string | undefined,
  stage: string,
  message: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  lycheeLog(eventId, stage, 'started', message);
  try {
    const result = await work();
    lycheeLog(eventId, stage, 'completed', message, {
      durationMs: Math.max(0, Date.now() - started),
    });
    return result;
  } catch (error) {
    const diagnostic =
      error instanceof PromptDeliveryError
        ? error.diagnostic
        : safeLycheeError(error);
    lycheeLog(eventId, stage, 'failed', message, {
      durationMs: Math.max(0, Date.now() - started),
      httpStatus: diagnostic.httpStatus,
      code: diagnostic.code,
      ...(error instanceof PromptDeliveryError ? error.diagnostic : {}),
    });
    throw error;
  }
}
