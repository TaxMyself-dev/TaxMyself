/** Provider status spelling already used by Feezback account responses. Unknown statuses fail closed. */
function validConsentIds(consents: any[], now: Date): Set<string> {
  return new Set(consents.filter(consent => {
    if (String(consent.consentStatus ?? '').toLowerCase() !== 'valid' || !consent.resourceId) return false;
    if (!consent.validUntil) return true;
    const expiry = new Date(consent.validUntil);
    return Number.isFinite(expiry.getTime()) && expiry > now;
  }).map(consent => consent.resourceId));
}

export function validConnectedSources(consents: any[], sources: any[], now = new Date()): any[] {
  const valid = validConsentIds(consents, now);
  return sources.filter(source => source.resourceId &&
    (!source.consentStatus || String(source.consentStatus).toLowerCase() === 'valid') &&
    [source.consentId, ...(source.relatedConsents ?? []).map((c: any) => c.resourceId)]
      .some(id => id && valid.has(id)));
}

/** Copy usable provider sources with a verified retry consent, without changing raw diagnostics. */
export function connectedSourcesWithCurrentConsent(consents: any[], sources: any[], now = new Date()): any[] {
  const valid = validConsentIds(consents, now);
  return validConnectedSources(consents, sources, now).map(source => ({
    ...source,
    consentId: [source.consentId, ...(source.relatedConsents ?? []).map((consent: any) => consent.resourceId)]
      .find(id => id && valid.has(id)),
  }));
}
