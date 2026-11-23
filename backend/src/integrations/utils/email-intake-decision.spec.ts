import { decideEmailIntake } from './email-intake-decision';

describe('Email intake triage', () => {
  const base = { keyword: false, bytes: 100000, aiEnabled: true, remaining: 2 };
  it('preserves password-required separately even with a keyword', () => {
    expect(decideEmailIntake({ ...base, keyword: true, pdf: { outcome: 'PASSWORD_REQUIRED', text: '' } })).toEqual({ kind: 'review_required', reason: 'password_required' });
  });
  it.each(['FAILED', 'TOO_LARGE', 'UNAVAILABLE'] as const)('does not label %s as irrelevant or send it to AI', outcome => {
    expect(decideEmailIntake({ ...base, pdf: { outcome, text: '' } })).toEqual({ kind: 'review_required', reason: 'pdf_unreadable' });
  });
  it('routes scans and keyword-free documents to the existing AI pipeline', () => {
    for (const pdf of [{ outcome: 'NO_TEXT' as const, text: '', pages: 1 }, { outcome: 'EXTRACTED' as const, text: 'account opening form', pages: 1 }]) {
      expect(decideEmailIntake({ ...base, pdf }).kind).toBe('ai_review');
    }
  });
  it('uses deterministic positive signals without requiring AI opt-in', () => {
    expect(decideEmailIntake({ ...base, keyword: true, aiEnabled: false }).kind).toBe('relevant');
  });
  it.each([
    [{ aiEnabled: false }, 'ai_disabled'], [{ remaining: 0 }, 'ai_budget'],
    [{ bytes: 11 * 1024 * 1024 }, 'ai_limits'], [{ pdf: { outcome: 'NO_TEXT', text: '', pages: 21 } }, 'ai_limits'],
  ])('retains unresolved files when a safety limit prevents AI', (override, reason) => {
    expect(decideEmailIntake({ ...base, ...override } as any)).toEqual({ kind: 'review_required', reason });
  });
});
