import { isDemoEmail } from '../../demo-data/profiles';

interface LocalConsentLink {
  consentId?: string | null;
  resourceId?: string | null;
  consentVerifiedAt?: Date | null;
}

/** Display provenance only. Never use this to waive cost, skip provider reads or authorize disconnection. */
export function hasLocalDemoData(
  email: string,
  links: LocalConsentLink[],
): boolean {
  if (isDemoEmail(email)) return true;
  // Legacy document-lab fixtures predate the profile registry. Require both explicit
  // fixture identifiers on every link and no provider verification; never infer from a name/email.
  return (
    links.length > 0 &&
    links.every(
      (link) =>
        !link.consentVerifiedAt &&
        link.consentId?.startsWith('expense-document-lab') &&
        link.resourceId?.startsWith('expense-document-lab'),
    )
  );
}
