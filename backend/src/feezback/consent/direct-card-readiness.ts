/** Readiness proof belongs to one consent and one provider identity only. */
export interface DirectCardReadiness {
  sub: string;
  consentId: string;
  fetchedAccounts: unknown;
  failedToFetchAccounts: unknown;
}
export function canClassifyDirectCard(card: any, sub: string, proof?: DirectCardReadiness): boolean {
  if (!proof || proof.sub !== sub || !proof.consentId || !Array.isArray(proof.fetchedAccounts) ||
      !Array.isArray(proof.failedToFetchAccounts)) return false;
  const consents = [card.consentId, ...(card.relatedConsents ?? []).map((c: any) => c.resourceId)];
  if (!consents.includes(proof.consentId)) return false;
  // An unattributed failure cannot safely certify any card in this event.
  if (proof.failedToFetchAccounts.some((entry: any) => !entry || typeof entry !== 'object' ||
      !(typeof entry.resourceId==='string' && entry.resourceId ||
        typeof entry.cashAccountType==='string' && (entry.maskedPan || entry.iban)))) return false;
  const pan = typeof card.maskedPan === 'string' ? card.maskedPan.replace(/[^0-9]/g, '') : '';
  const matches = (entry: any, failure = false) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.resourceId) return entry.resourceId === card.resourceId;
    if (entry.cashAccountType !== 'CARD' || typeof entry.maskedPan !== 'string' || !pan) return false;
    // Match the complete masked identifier, not just the last four digits.
    const otherPan = entry.maskedPan.replace(/[^0-9]/g, '');
    if (failure) return !!otherPan && otherPan.slice(-4) === pan.slice(-4) &&
      (!entry.currency || entry.currency === card.currency);
    return otherPan === pan && entry.currency === card.currency;
  };
  return proof.fetchedAccounts.some(entry => matches(entry)) && !proof.failedToFetchAccounts.some(entry => matches(entry,true));
}
