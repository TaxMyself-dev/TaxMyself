import { hasLocalDemoData } from './feezback-local-data';

describe('Feezback local data provenance (display only)', () => {
  const fixture = {
    consentId: 'expense-document-lab-consent',
    resourceId: 'expense-document-lab-bank',
    consentVerifiedAt: null,
  };
  it('recognizes registered demos and explicit unverified legacy document fixtures', () => {
    expect(hasLocalDemoData('demo+shaam-allocation@keepintax.local', [])).toBe(
      true,
    );
    expect(hasLocalDemoData('lab@example.com', [fixture])).toBe(true);
  });
  it('does not infer demo data from an arbitrary demo-like email or a single matching identifier', () => {
    expect(hasLocalDemoData('demo@gmail.com', [])).toBe(false);
    expect(
      hasLocalDemoData('lab@example.com', [
        { ...fixture, resourceId: 'real-bank' },
      ]),
    ).toBe(false);
  });
  it('does not label mixed or provider-verified links as unverified fixtures', () => {
    expect(
      hasLocalDemoData('lab@example.com', [
        fixture,
        { consentId: 'real', resourceId: 'real' },
      ]),
    ).toBe(false);
    expect(
      hasLocalDemoData('lab@example.com', [
        { ...fixture, consentVerifiedAt: new Date() },
      ]),
    ).toBe(false);
  });
});
