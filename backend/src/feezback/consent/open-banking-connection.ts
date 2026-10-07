/** Provider status spelling already used by Feezback account responses. Unknown statuses fail closed. */
export function validConnectedSources(consents: any[], sources: any[], now = new Date()): any[] {
  const valid = new Set(consents.filter(consent => {
    if (String(consent.consentStatus ?? '').toLowerCase() !== 'valid' || !consent.resourceId) return false;
    if (!consent.validUntil) return true;
    const expiry = new Date(consent.validUntil);
    return Number.isFinite(expiry.getTime()) && expiry > now;
  }).map(consent => consent.resourceId));
  return sources.filter(source => source.resourceId &&
    (!source.consentStatus || String(source.consentStatus).toLowerCase() === 'valid') &&
    [source.consentId, ...(source.relatedConsents ?? []).map((c: any) => c.resourceId)]
      .some(id => id && valid.has(id)));
}
