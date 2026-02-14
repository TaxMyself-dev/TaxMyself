import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { FeezbackConsent } from './entities/feezback-consent.entity';

export interface FeezbackConsentUpsertInput {
  firebaseId: string;
  tppId: string;
  userIdentifier: string;
  consentId: string;
  rootConsentId?: string | null;
  flowId?: string | null;
  context?: string | null;
  status?: string | null;
  validUntil?: Date | null;
  recurringIndicator?: boolean | null;
  aspspCode?: string | null;
  accessJson?: any;
  metaJson?: any;
  rawLastWebhookJson?: any;
  needsSync?: boolean;
  lastSyncAt?: Date | null;
  lastSyncError?: string | null;
}

@Injectable()
export class FeezbackConsentService {
  private readonly logger = new Logger(FeezbackConsentService.name);

  constructor(
    @InjectRepository(FeezbackConsent)
    private readonly consentRepository: Repository<FeezbackConsent>,
  ) { }

  private getRepository(manager?: EntityManager): Repository<FeezbackConsent> {
    return manager ? manager.getRepository(FeezbackConsent) : this.consentRepository;
  }

  async upsertConsent(data: FeezbackConsentUpsertInput, manager?: EntityManager): Promise<FeezbackConsent> {
    const repository = this.getRepository(manager);

    let consent = await repository.findOne({
      where: {
        firebaseId: data.firebaseId,
        tppId: data.tppId,
        consentId: data.consentId,
      },
    });

    if (!consent) {
      consent = repository.create({
        firebaseId: data.firebaseId,
        tppId: data.tppId,
        consentId: data.consentId,
        userIdentifier: data.userIdentifier,
        needsSync: data.needsSync ?? true,
      });
    }

    if (data.rootConsentId !== undefined) {
      consent.rootConsentId = data.rootConsentId;
    }

    if (data.userIdentifier !== undefined) {
      consent.userIdentifier = data.userIdentifier;
    }

    if (data.flowId !== undefined) {
      consent.flowId = data.flowId;
    }

    if (data.context !== undefined) {
      consent.context = data.context;
    }

    if (data.status !== undefined) {
      consent.status = data.status;
    }

    if (data.validUntil !== undefined) {
      consent.validUntil = data.validUntil;
    }

    if (data.recurringIndicator !== undefined) {
      consent.recurringIndicator = data.recurringIndicator;
    }

    if (data.aspspCode !== undefined) {
      consent.aspspCode = data.aspspCode;
    }

    if (data.accessJson !== undefined) {
      consent.accessJson = data.accessJson;
    }

    if (data.metaJson !== undefined) {
      consent.metaJson = data.metaJson;
    }

    if (data.rawLastWebhookJson !== undefined) {
      consent.rawLastWebhookJson = data.rawLastWebhookJson;
    }

    if (data.needsSync !== undefined) {
      consent.needsSync = data.needsSync;
    }

    if (data.lastSyncAt !== undefined) {
      consent.lastSyncAt = data.lastSyncAt;
    }

    if (data.lastSyncError !== undefined) {
      consent.lastSyncError = data.lastSyncError;
    }

    return repository.save(consent);
  }

  async upsertMany(consents: FeezbackConsentUpsertInput[], manager?: EntityManager): Promise<FeezbackConsent[]> {
    const results: FeezbackConsent[] = [];

    for (const consentData of consents) {
      const saved = await this.upsertConsent(consentData, manager);
      results.push(saved);
    }

    return results;
  }

  async findByFirebaseId(firebaseId: string): Promise<FeezbackConsent[]> {
    return this.consentRepository.find({
      where: { firebaseId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findByFirebaseIdAndTpp(firebaseId: string, tppId: string): Promise<FeezbackConsent[]> {
    return this.consentRepository.find({
      where: { firebaseId, tppId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findByConsentId(consentId: string, tppId: string): Promise<FeezbackConsent | null> {
    return this.consentRepository.findOne({
      where: {
        consentId,
        tppId,
      },
    });
  }

  async updateConsentById(consentId: string, tppId: string, updates: Partial<FeezbackConsent>): Promise<void> {
    await this.consentRepository.update({ consentId, tppId }, updates);
  }

  async findConsentsNeedingSync(limit: number): Promise<FeezbackConsent[]> {
    return this.consentRepository.find({
      where: { needsSync: true },
      order: { updatedAt: 'ASC' },
      take: limit,
    });
  }

  async updateConsent(consent: FeezbackConsent, updates: Partial<FeezbackConsent>, manager?: EntityManager): Promise<FeezbackConsent> {
    const repository = this.getRepository(manager);
    Object.assign(consent, updates);
    return repository.save(consent);
  }
}
