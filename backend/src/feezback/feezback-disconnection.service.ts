import { usesSyntheticOpenBanking } from '../demo-data/profiles';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackApiService } from './api/feezback-api.service';
import { User } from '../users/user.entity';
import { Source, ConnectionRole } from '../transactions/source.entity';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { feezbackSub } from './utils/feezback-identity';
import { validConnectedSources } from './consent/open-banking-connection';
import { connectionOperation } from './consent/connection-operation';
import { FeezbackHttpError } from './core/feezback-errors';

export interface DisconnectionConsent {
  consentId: string;
  connectionRole: ConnectionRole;
  status: string;
  sources: Array<{ sourceRecordId: number | null; sourceName: string; sourceType: string; resourceId?: string }>;
}
export interface DisconnectionTargets {
  consents: DisconnectionConsent[];
  complete: boolean;
  hasOpenBanking: boolean;
  errors: Array<{
    connectionRole: ConnectionRole;
    code: string;
    operation?: 'consents' | 'accounts' | 'cards';
    stage?: 'authentication' | 'provider' | 'response' | 'unknown';
    httpStatus?: number;
  }>;
}
export interface DisconnectRequest {
  scope: 'all' | 'consent';
  consentId?: string;
  connectionRole?: ConnectionRole;
}
const terminal = new Set(['terminatedbytpp', 'revokedbypsu', 'expired', 'rejected', 'noanswer']);

// Return only allowlisted operational metadata: provider errors can contain
// identity-bearing URLs, echoed credentials and financial response bodies.
function readFailure(connectionRole: ConnectionRole, operation: 'consents' | 'accounts' | 'cards', error: unknown): DisconnectionTargets['errors'][number] {
  const diagnostic: DisconnectionTargets['errors'][number] = {
    connectionRole, code: `${operation}_unavailable`, operation, stage: 'unknown',
  };
  if (error instanceof FeezbackHttpError) {
    diagnostic.stage = 'provider';
    try {
      if (/\/token\/?$/.test(new URL(error.url).pathname)) diagnostic.stage = 'authentication';
    } catch { /* No URL or error text is exposed. */ }
    if (Number.isInteger(error.status) && error.status! >= 100 && error.status! <= 599) diagnostic.httpStatus = error.status;
  } else if (error instanceof Error && ['Malformed consents', 'Malformed sources',
    'Invalid Feezback consent response', 'Invalid Feezback cards response'].includes(error.message)) {
    diagnostic.stage = 'response';
  }
  return diagnostic;
}

@Injectable()
export class FeezbackDisconnectionService {
  constructor(
    private readonly api: FeezbackApiService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Source) private readonly sources: Repository<Source>,
    private readonly sync: UserSyncStateService,
  ) {}

  async targets(firebaseId: string): Promise<DisconnectionTargets> {
    return connectionOperation(firebaseId, async () => {
      const { verifiedSources, ...targets } = await this.readTargets(firebaseId);
      return targets;
    });
  }

  private async resetDisconnectedFlags(firebaseId: string): Promise<void> {
    await this.users.update({ firebaseId }, { hasOpenBanking: false, hasSpouseFeezbackIdentity: false });
    await this.sync.clearConsentInitiated(firebaseId);
  }

  private async readTargets(firebaseId: string, resetFullyDisconnected = true): Promise<DisconnectionTargets & { verifiedSources: Map<string, Set<number>> }> {
    const user = await this.users.findOne({ where: { firebaseId } });
    if (!user) throw new BadRequestException('User not found');
    if (usesSyntheticOpenBanking(user.email)) throw new BadRequestException({
      code: 'SYNTHETIC_OPEN_BANKING',
      message: 'נתוני הבנקאות בחשבון הדמו הם סינתטיים ומתעדכנים באמצעות איפוס הנתונים',
    });
    const stored = await this.sources.find({ where: { userId: firebaseId } });
    const rows = await this.sync.getSourceResults(firebaseId);
    // Pending spouse onboarding may exist before a data-ready webhook sets the historical flag.
    const roles: ConnectionRole[] = ['primary', 'spouse'];
    const consents: DisconnectionConsent[] = [];
    const verifiedSources = new Map<string, Set<number>>();
    const errors: DisconnectionTargets['errors'] = [];
    let connected = false;
    let connectionComplete = true;
    for (const connectionRole of roles) {
      const sub = feezbackSub(firebaseId, connectionRole === 'spouse');
      let providerConsents: any[];
      try {
        const response = await this.api.getUserConsents(sub, true);
        if (!Array.isArray(response?.consents) || response.consents.some(c => typeof c?.resourceId !== 'string' || !c.resourceId.trim())) throw new Error('Malformed consents');
        providerConsents = response.consents;
      } catch (error) {
        errors.push(readFailure(connectionRole, 'consents', error));
        connectionComplete = false;
        continue;
      }
      let providerSources: any[] = [];
      const active = providerConsents.filter(c => !terminal.has(String(c.consentStatus ?? '').toLowerCase()));
      if (active.length) {
        const reads = await Promise.allSettled([
          this.api.getUserAccounts(sub, { preventUpdate: true, withInvalid: true }),
          this.api.getUserCards(sub, { preventUpdate: true, withInvalid: true, strictResponse: true }),
        ]);
        reads.forEach((read, index) => {
          const key = index === 0 ? 'accounts' : 'cards';
          if (read.status === 'fulfilled' && Array.isArray(read.value?.[key]) &&
            read.value[key].every((source: any) => typeof source?.resourceId === 'string' && source.resourceId.trim())) providerSources.push(...read.value[key].map((source: any) => ({
              ...source, __previewSourceType: index === 0 ? 'BANK_ACCOUNT' : 'CREDIT_CARD',
            })));
          else {
            connectionComplete = false;
            errors.push(readFailure(connectionRole, key, read.status === 'rejected' ? read.reason : new Error('Malformed sources')));
          }
        });
        connected ||= validConnectedSources(providerConsents, providerSources).length > 0;
      }
      for (const consent of active) {
        const linkedProviderSources = providerSources.filter(source => source.consentId === consent.resourceId ||
          source.relatedConsents?.some((c: any) => c.resourceId === consent.resourceId));
        const ids = new Set(linkedProviderSources.map(source => source.resourceId));
        const matchingRows = rows.filter(row => (row.connectionRole ?? 'primary') === connectionRole &&
          (row.consentId === consent.resourceId || (row.resourceId && ids.has(row.resourceId))));
        const usableIds = new Set(validConnectedSources([consent], providerSources).map(source => source.resourceId));
        verifiedSources.set(`${connectionRole}:${consent.resourceId}`, new Set(rows.filter(row =>
          (row.connectionRole ?? 'primary') === connectionRole && row.resourceId && usableIds.has(row.resourceId) &&
          stored.some(source => source.id === row.sourceRecordId && (source.connectionRole ?? 'primary') === connectionRole))
          .map(row => row.sourceRecordId!)));
        const preview: DisconnectionConsent['sources'] = stored.filter(source => (source.connectionRole ?? 'primary') === connectionRole &&
            (matchingRows.some(row => row.sourceRecordId === source.id))).map(source => ({
              sourceRecordId: source.id, sourceName: source.sourceName, sourceType: source.sourceType,
            }));
        const representedResources = new Set(matchingRows.filter(row => preview.some(source => source.sourceRecordId === row.sourceRecordId))
          .map(row => row.resourceId).filter(Boolean));
        for (const source of linkedProviderSources) {
          if (representedResources.has(source.resourceId)) continue;
          representedResources.add(source.resourceId);
          const masked = source.__previewSourceType === 'BANK_ACCOUNT'
            ? typeof source.iban === 'string' ? source.iban.replace(/\s/g, '').slice(-7) : ''
            : typeof source.maskedPan === 'string' ? source.maskedPan.match(/(\d{4})$/)?.[1] ?? '' : '';
          const currency = typeof source.currency === 'string' && /^[A-Z]{3}$/.test(source.currency) ? source.currency : '';
          preview.push({ sourceRecordId: null, resourceId: source.resourceId, sourceType: source.__previewSourceType,
            sourceName: masked ? `•••${masked}${currency ? ` ${currency}` : ''}` : 'אמצעי תשלום נוסף' });
        }
        consents.push({ consentId: consent.resourceId, connectionRole, status: consent.consentStatus ?? 'unknown',
          sources: preview,
        });
      }
    }
    // A complete consent read proving no active permission clears the flag even
    // when stale provider accounts still exist. Partial reads never clear it.
    let hasOpenBanking = user.hasOpenBanking;
    const fullyDisconnected = connectionComplete && errors.length === 0 && consents.length === 0;
    if (fullyDisconnected && resetFullyDisconnected) {
      await this.resetDisconnectedFlags(firebaseId);
      hasOpenBanking = false;
    } else if (connected || (connectionComplete && errors.length === 0)) {
      hasOpenBanking = connected;
      await this.users.update({ firebaseId }, { hasOpenBanking });
    }
    return { consents, complete: errors.length === 0, hasOpenBanking, errors, verifiedSources };
  }

  async disconnect(firebaseId: string, request: DisconnectRequest) {
    if (!request || !['all', 'consent'].includes(request.scope)) throw new BadRequestException('Invalid disconnect scope');
    if (request.scope === 'consent' && (!request.consentId || !['primary', 'spouse'].includes(request.connectionRole ?? ''))) {
      throw new BadRequestException('consentId and connectionRole are required');
    }
    return connectionOperation(firebaseId, async () => {
      const before = await this.readTargets(firebaseId, false);
      const targets = request.scope === 'all' ? before.consents : before.consents.filter(c =>
        c.consentId === request.consentId && c.connectionRole === request.connectionRole);
      if (request.scope === 'consent' && !targets.length) throw new BadRequestException('Consent is not an active permission owned by this user');
      const attempts = await Promise.all(targets.map(async target => {
        try {
          await this.api.terminateConsent(feezbackSub(firebaseId, target.connectionRole === 'spouse'), target.consentId);
          return { ...target, failed: false };
        } catch { return { ...target, failed: true }; }
      }));
      const after = await this.readTargets(firebaseId, false);
      const results: Array<{ consentId: string; connectionRole: ConnectionRole; status: 'terminated' | 'failed' | 'pending' }> = [];
      for (const attempt of attempts) {
        const identityReadFailed = after.errors.some(error => error.connectionRole === attempt.connectionRole && error.code === 'consents_unavailable');
        const remains = after.consents.some(c => c.connectionRole === attempt.connectionRole && c.consentId === attempt.consentId);
        const status = !identityReadFailed && !remains ? 'terminated' : attempt.failed ? 'failed' : 'pending';
        results.push({ consentId: attempt.consentId, connectionRole: attempt.connectionRole, status });
      }
      // Rebind shared sources before clearing old consent pointers. This also
      // repairs a missed terminal webhook on an already-disconnected retry.
      // Consent-only upserts preserve current sync outcomes and all permanent data.
      const rows = await this.sync.getSourceResults(firebaseId);
      for (const role of ['primary', 'spouse'] as ConnectionRole[]) {
        if (after.errors.some(error => error.connectionRole === role)) continue;
        const active = after.consents.filter(c => c.connectionRole === role);
        const stale = rows.filter(row => (row.connectionRole ?? 'primary') === role && row.consentId &&
          !active.some(c => c.consentId === row.consentId));
        for (const row of stale) {
          const replacement = active.find(c => row.sourceRecordId &&
            after.verifiedSources.get(`${role}:${c.consentId}`)?.has(row.sourceRecordId));
          if (replacement) await this.sync.upsertSourceConsents(firebaseId, [{
            type: row.type, sourceId: row.sourceId, sourceRecordId: row.sourceRecordId,
            connectionRole: role, resourceId: row.resourceId, consentId: replacement.consentId,
          }]);
        }
        for (const id of new Set(stale.map(row => row.consentId!))) {
          await this.sync.clearConsentOnSources(firebaseId, id, role === 'spouse');
        }
      }
      // Verification after a timeout can still prove success. Discovery errors,
      // remaining permissions and asynchronous provider termination stay visible.
      const success = after.complete && results.every(r => r.status === 'terminated') &&
        (request.scope !== 'all' || after.consents.length === 0) &&
        !before.errors.some(e => e.code === 'consents_unavailable');
      if (success && after.consents.length === 0) await this.resetDisconnectedFlags(firebaseId);
      return { status: success ? 'success' as const : 'partial' as const, results,
        remainingConsents: after.consents, complete: after.complete,
        hasOpenBanking: after.hasOpenBanking, errors: [...before.errors, ...after.errors] };
    });
  }
}
