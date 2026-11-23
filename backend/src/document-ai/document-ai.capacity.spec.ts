import {
  capacityProfile,
  chooseJob,
  refill,
  reserve,
  CapacityProfile,
} from './document-ai.capacity';
import { AnalysisJob } from './document-ai.types';
export const profile: CapacityProfile = {
  provider: 'anthropic',
  model: 'test-model',
  key: 'test-group',
  concurrency: 8,
  rpm: 60,
  itpm: 60000,
  otpm: 6000,
  pdfPageTokens: 1000,
  imageTokens: 1000,
  outputEstimate: 100,
};
const job = (owner: string, sequence: number, interactive = 0) =>
  ({
    id: String(sequence),
    owner,
    business: 'business',
    sequence,
    interactive,
  } as AnalysisJob);
describe('work-conserving fair document admission', () => {
  it('fails closed on corrupted persisted token counters', () => {
    expect(() =>
      refill(profile, { at: 1, requests: NaN, input: 10, output: 10 }, 2),
    ).toThrow('Invalid persisted');
  });
  it('never invents provider limits when the operational profile is absent', () => {
    expect(() => capacityProfile({})).toThrow('limit group');
  });
  it('allows a single tenant to occupy every available admission', () => {
    let state = refill(profile, null, 0);
    const pending = Array.from({ length: 8 }, (_, i) => job('one', i));
    for (let i = 0; i < 8; i++) {
      const choice = chooseJob([pending[i]], state);
      expect(choice.job).toBe(pending[i]);
      state = choice.state;
    }
  });
  it('serves a newly competing tenant on the next fair admission', () => {
    let state = chooseJob([job('a', 1)], refill(profile, null, 0)).state;
    expect(chooseJob([job('a', 2), job('b', 3)], state).job.owner).toBe('b');
  });
  it('round-robins three tenants rather than draining the oldest bulk import', () => {
    let state = refill(profile, null, 0);
    const seen = [];
    for (let i = 0; i < 9; i++) {
      const choice = chooseJob([job('a', 1), job('b', 2), job('c', 3)], state);
      seen.push(choice.job.owner);
      state = choice.state;
    }
    expect(seen).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c']);
  });
  it('gives interactive work preference without starving background work', () => {
    let state = refill(profile, null, 0);
    const lanes = [];
    for (let i = 0; i < 8; i++) {
      const choice = chooseJob([job('manual', 1, 1), job('bulk', 2)], state);
      lanes.push(choice.job.interactive);
      state = choice.state;
    }
    expect(lanes).toEqual([1, 1, 1, 0, 1, 1, 1, 0]);
  });
  it('does not reserve idle slots for a missing priority lane', () => {
    const state = { ...refill(profile, null, 0), interactiveBurst: 99 };
    expect(chooseJob([job('only', 1, 1)], state).job.owner).toBe('only');
    expect(chooseJob([job('only', 2)], state).job.owner).toBe('only');
  });
  it('accounts for requests, input and output separately', () => {
    const state = refill(profile, null, 0);
    const r = reserve(profile, state, 1000, 100, 0);
    expect(r.state).toMatchObject({ requests: 59, input: 59000, output: 5900 });
    expect(r.waitMs).toBe(0);
  });
  it('waits for the most restrictive exhausted bucket', () => {
    const state = {
      ...refill(profile, null, 0),
      requests: 0,
      input: 0,
      output: 0,
    };
    expect(reserve(profile, state, 2000, 300, 0).waitMs).toBe(3000);
  });
  it('uses fractional continuous replenishment rather than minute bursts', () => {
    const state = { ...refill(profile, null, 0), requests: 0 };
    expect(reserve(profile, state, 100, 100, 500).waitMs).toBe(500);
  });
  it('honors a provider-wide Retry-After cooldown', () => {
    const state = { ...refill(profile, null, 0), blockedUntil: 12000 };
    expect(reserve(profile, state, 100, 100, 2000).waitMs).toBe(10000);
  });
  it('blocks an individually oversized estimate instead of retrying forever', () => {
    expect(
      reserve(profile, refill(profile, null, 0), 60001, 100, 0).oversized,
    ).toBe(true);
  });
  it('does not gain capacity from a backwards clock', () => {
    const state = { ...refill(profile, null, 1000), requests: 0 };
    expect(refill(profile, state, 0).requests).toBe(0);
  });
});
