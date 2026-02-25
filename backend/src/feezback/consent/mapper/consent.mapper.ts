import { Injectable, Logger } from '@nestjs/common';
import { FeezbackConsentUpsertInput } from '../feezback-consent.service';

@Injectable()
export class ConsentMapper {
  private readonly logger = new Logger(ConsentMapper.name);

  toValidUntilDate(raw: unknown): Date | null {
    if (!raw || typeof raw !== 'string') {
      return null;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  toRecurringIndicator(raw: unknown): boolean | null {
    if (typeof raw === 'boolean') {
      return raw;
    }

    if (typeof raw === 'string') {
      const lowered = raw.toLowerCase();
      if (lowered === 'true') {
        return true;
      }
      if (lowered === 'false') {
        return false;
      }
    }

    return null;
  }

  normalizeConsent(
    rawConsent: any,
    firebaseId: string,
    tppId: string,
    userIdentifier: string,
    syncedAt: Date,
  ): FeezbackConsentUpsertInput | null {
    const rawConsentId = rawConsent?.resourceId || rawConsent?.consentId || rawConsent?.id;
    const consentId = typeof rawConsentId === 'string' ? rawConsentId.trim() : null;

    if (!consentId) {
      this.logger.debug('Skipping consent normalization due to missing consent identifier');
      return null;
    }

    const validUntilInput = rawConsent?.validUntil || rawConsent?.expirationDate || rawConsent?.expires || null;
    const validUntil = this.toValidUntilDate(validUntilInput);
    const recurringIndicator = this.toRecurringIndicator(rawConsent?.recurringIndicator);

    return {
      firebaseId,
      tppId,
      userIdentifier,
      consentId,
      flowId: rawConsent?.flowId || rawConsent?.flow || null,
      context: rawConsent?.context || null,
      status: rawConsent?.consentStatus || rawConsent?.status || null,
      validUntil,
      recurringIndicator,
      aspspCode: rawConsent?.aspspCode || rawConsent?.bankId || rawConsent?.institutionId || null,
      accessJson: rawConsent?.access || rawConsent?.accesses || null,
      metaJson: rawConsent,
      needsSync: false,
      lastSyncAt: syncedAt,
      lastSyncError: null,
    };
  }
}
