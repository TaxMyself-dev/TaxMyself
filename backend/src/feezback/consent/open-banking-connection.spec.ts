import { validConnectedSources } from './open-banking-connection';
describe('verified Feezback connection', () => {
  const now = new Date('2026-10-07');
  const consent = { resourceId: 'c1', consentStatus: 'valid', validUntil: '2027-01-01' };
  const source = { resourceId: 'bank1', consentId: 'c1' };
  it('requires at least one linked valid source; empty responses are not onboarding', () => {
    expect(validConnectedSources([consent], [], now)).toEqual([]);
    expect(validConnectedSources([], [source], now)).toEqual([]);
    expect(validConnectedSources([consent], [source], now)).toEqual([source]);
  });
  it.each(['revoked', 'expired', 'rejected', 'unknown'])('rejects %s consent', consentStatus => {
    expect(validConnectedSources([{ ...consent, consentStatus }], [source], now)).toEqual([]);
  });
  it('rejects expired dates, invalid dates and unmatched sources', () => {
    for (const validUntil of ['2020-01-01', 'invalid']) expect(validConnectedSources([{ ...consent, validUntil }], [source], now)).toEqual([]);
    expect(validConnectedSources([consent], [{ ...source, consentId: 'other' }], now)).toEqual([]);
  });
  it('keeps another valid connection when one consent was revoked', () => {
    expect(validConnectedSources([{ ...consent, consentStatus: 'revoked' }, { ...consent, resourceId: 'c2' }],
      [source, { resourceId: 'card1', relatedConsents: [{ resourceId: 'c2' }] }], now)).toHaveLength(1);
  });
});
