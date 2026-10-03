import {
  canUseProfessionalReviewView,
  resolveReviewViewMode,
} from './report-review-view-mode';

describe('report-review view access', () => {
  it('allows accountants and administrators to use the professional view', () => {
    expect(canUseProfessionalReviewView(['ACCOUNTANT'])).toBeTrue();
    expect(canUseProfessionalReviewView(['ADMIN'])).toBeTrue();
    expect(resolveReviewViewMode('professional', true)).toBe('professional');
  });

  it('forces every other role to the regular view', () => {
    expect(canUseProfessionalReviewView(['CLIENT'])).toBeFalse();
    expect(canUseProfessionalReviewView(undefined)).toBeFalse();
    expect(resolveReviewViewMode('professional', false)).toBe('regular');
  });

  it('does not grant access for a role name that merely contains ADMIN', () => {
    expect(canUseProfessionalReviewView('NOT_ADMIN')).toBeFalse();
  });
});
