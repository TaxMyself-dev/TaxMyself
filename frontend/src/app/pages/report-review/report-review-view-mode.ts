export type ReviewViewMode = 'regular' | 'professional';

export function canUseProfessionalReviewView(
  role: string | readonly string[] | null | undefined,
  isViewingDemoUser = false,
): boolean {
  if (isViewingDemoUser) return false;

  if (typeof role === 'string') {
    return role === 'ACCOUNTANT' || role === 'ADMIN';
  }

  return role?.includes('ACCOUNTANT') === true || role?.includes('ADMIN') === true;
}

export function resolveReviewViewMode(
  requestedMode: unknown,
  canUseProfessionalView: boolean,
): ReviewViewMode {
  return canUseProfessionalView && requestedMode === 'professional'
    ? 'professional'
    : 'regular';
}
