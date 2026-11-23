import { AsyncLocalStorage } from 'node:async_hooks';

/** Operational IDs only. Never put provider payloads, identities or credentials here. */
export const feezbackDiagnosticContext = new AsyncLocalStorage<{
  syncRunId?: string;
  connectionRole: 'primary' | 'spouse';
  sourceRecordId?: number;
  sourceRecordIds?: number[];
  operation: string;
}>();
