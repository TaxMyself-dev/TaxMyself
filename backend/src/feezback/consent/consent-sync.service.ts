import { Injectable, Logger } from '@nestjs/common';
import { FeezbackApiService } from '../api/feezback-api.service';
import { FeezbackConsentService, FeezbackConsentUpsertInput } from './feezback-consent.service';
import { ConsentMapper } from './mapper/consent.mapper';
import { FeezbackConsent } from './entities/feezback-consent.entity';

@Injectable()
export class ConsentSyncService {
  private readonly logger = new Logger(ConsentSyncService.name);

  constructor(
    private readonly feezbackApiService: FeezbackApiService,
    private readonly consentService: FeezbackConsentService,
    private readonly consentMapper: ConsentMapper,
  ) { }

  async syncUserConsents(firebaseId: string, sub: string, tppId: string): Promise<FeezbackConsent[]> {
    const userIdentifier = `${sub}@${tppId}`;
    this.logger.log(`Syncing user consents for firebaseId=${firebaseId}, sub=${sub}, userIdentifier=${userIdentifier}`);

    try {
      const consentsResponse = await this.feezbackApiService.getUserConsents(sub);
      const rawConsents = Array.isArray(consentsResponse?.consents) ? consentsResponse.consents : [];

      if (rawConsents.length === 0) {
        this.logger.warn(`No consents returned from Feezback for firebaseId=${firebaseId}`);
      }

      const syncedAt = new Date();
      const upsertPayload = rawConsents
        .map(consent => this.consentMapper.normalizeConsent(consent, firebaseId, tppId, userIdentifier, syncedAt))
        .filter((payload): payload is FeezbackConsentUpsertInput => Boolean(payload));

      if (upsertPayload.length > 0) {
        await this.consentService.upsertMany(upsertPayload);
        this.logger.log(`Upserted ${upsertPayload.length} consents for firebaseId=${firebaseId}`);
      } else {
        this.logger.warn(`No valid consents to upsert for firebaseId=${firebaseId}`);
      }

      return this.consentService.findByFirebaseIdAndTpp(firebaseId, tppId);
    } catch (error: any) {
      this.logger.error(`Failed to sync user consents for firebaseId=${firebaseId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
