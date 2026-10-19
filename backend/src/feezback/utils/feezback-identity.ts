import type { ConnectionRole } from '../../transactions/source.entity';
export function feezbackSub(firebaseId: string, spouse = false): string {
  return firebaseId + (spouse ? '_sub_spouse' : '_sub');
}
// Retained only for opaque provider transaction IDs to preserve existing rows/idempotency.
export const SPOUSE_TRANSACTION_SUFFIX = '_spouse';
export function subForSource(firebaseId: string, role: ConnectionRole): string {
  return feezbackSub(firebaseId, role === 'spouse');
}
