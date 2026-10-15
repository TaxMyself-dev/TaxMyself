/** Stable provider identities; creating a link never registers another random identity. */
export function feezbackSub(firebaseId: string, spouse = false): string {
  return firebaseId + (spouse ? '_sub_spouse' : '_sub');
}
/** Secondary source IDs are deterministic and cannot collide with primary masked numbers. */
export const SPOUSE_SOURCE_SUFFIX = '_spouse';
export function subForSource(firebaseId: string, sourceId: string): string {
  return feezbackSub(firebaseId, sourceId.endsWith(SPOUSE_SOURCE_SUFFIX));
}
