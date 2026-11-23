import { AsyncLocalStorage } from 'async_hooks';

/** Request-local cancellation; never changes another request's transport options. */
export const documentExecution = new AsyncLocalStorage<AbortSignal>();
export function assertDocumentExecution(): void {
  if (documentExecution.getStore()?.aborted)
    throw new Error('DOCUMENT_ROUND_CANCELLED');
}
export function documentTransportOptions() {
  const signal = documentExecution.getStore();
  assertDocumentExecution();
  return signal ? { signal, timeout: 30000, retry: false } : {};
}
export function schedulerDispatch(): boolean {
  return process.env.DOCUMENT_AI_DISPATCH_MODE === 'scheduler';
}
