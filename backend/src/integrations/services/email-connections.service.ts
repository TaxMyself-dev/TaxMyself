import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ComposioClientService, objectValue } from './composio-client.service';
import { OauthStateService } from './oauth-state.service';
import { UserIntegrationsService } from './user-integrations.service';
import { IntegrationProvider, IntegrationStatus, IntegrationSyncStatus } from '../enums/integrations.enums';
import { EmailAccountContext } from '../providers/email-provider';

@Injectable()
export class EmailConnectionsService {
  constructor(private readonly composio: ComposioClientService, private readonly states: OauthStateService, private readonly integrations: UserIntegrationsService) {}

  async connect(firebaseId: string, targetIntegrationId?: number, provider = IntegrationProvider.GOOGLE): Promise<{ url: string }> {
    this.composio.assertEnabled();
    this.assertEmailProvider(provider);
    if (targetIntegrationId !== undefined) {
      const target = await this.integrations.findOwnedByIdOrThrow(targetIntegrationId, firebaseId);
      if (target.provider !== provider || target.lastSyncStatus === IntegrationSyncStatus.RUNNING) throw new ConflictException('Connection cannot be replaced');
    }
    const callback = new URL(process.env[provider === IntegrationProvider.MICROSOFT ? 'COMPOSIO_OUTLOOK_CALLBACK_URL' : 'COMPOSIO_GMAIL_CALLBACK_URL'] || '');
    if (callback.protocol !== 'https:' && !(this.composio.environment() === 'dev' && callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname))) throw new BadRequestException('Invalid callback configuration');
    const state = await this.states.createState(firebaseId, provider);
    callback.searchParams.set('state', state);
    const request = provider === IntegrationProvider.GOOGLE
      ? await this.composio.link(firebaseId, callback.toString())
      : await this.composio.link(firebaseId, callback.toString(), 'outlook');
    await this.states.bindConnection(state, request.id, targetIntegrationId);
    return { url: request.redirectUrl };
  }

  async complete(state: string, connectedAccountId: string, status: string, provider = IntegrationProvider.GOOGLE): Promise<void> {
    this.assertEmailProvider(provider);
    const attempt = await this.states.consumeState(state, provider);
    if (status !== 'success' || !connectedAccountId || attempt.connectedAccountId !== connectedAccountId) throw new BadRequestException('Connection was canceled or invalid');
    const account: EmailAccountContext = { firebaseId: attempt.firebaseId, connectedAccountId, environment: this.composio.environment(), ...(provider === IntegrationProvider.MICROSOFT ? { toolkit: 'outlook' as const } : {}) };
    await this.composio.assertAccount(account);
    const microsoft = provider === IntegrationProvider.MICROSOFT;
    const response = await this.composio.execute(account, microsoft ? 'OUTLOOK_GET_PROFILE' : 'GMAIL_WHO_AM_I', microsoft ? { select: ['id', 'mail', 'userPrincipalName'] } : {});
    const profile = microsoft ? objectValue(response) : objectValue(response.data);
    const identity = microsoft ? { sub: profile.id, email: profile.mail || profile.userPrincipalName } : profile;
    if (typeof identity.sub !== 'string' || !identity.sub || typeof identity.email !== 'string' || !identity.email.includes('@')) throw new BadRequestException('Mailbox identity unavailable');
    if (attempt.targetIntegrationId) {
      const target = await this.integrations.findOwnedByIdOrThrow(attempt.targetIntegrationId, attempt.firebaseId);
      if (target.provider !== provider || target.accountId !== identity.sub) throw new ConflictException('A different mailbox was selected');
    }
    const saved = await this.integrations.upsertIntegration({ firebaseId: attempt.firebaseId, provider, accountId: identity.sub, accountEmail: identity.email, connectedAccountId });
    if (saved.retiredConnectedAccountIds?.length) {
      try {
        for (const id of saved.retiredConnectedAccountIds) await this.composio.remove({ ...account, connectedAccountId: id });
        await this.integrations.clearRetiredConnections(saved.id, connectedAccountId);
      } catch { /* Pointers remain persisted for retry during disconnect/reconnect. */ }
    }
  }

  private assertEmailProvider(provider: IntegrationProvider): void {
    if (![IntegrationProvider.GOOGLE, IntegrationProvider.MICROSOFT].includes(provider)) throw new BadRequestException('Unsupported email provider');
  }

  async disconnect(firebaseId: string, integrationId: number): Promise<void> {
    const integration = await this.integrations.findOwnedByIdOrThrow(integrationId, firebaseId);
    if (![IntegrationProvider.GOOGLE, IntegrationProvider.MICROSOFT].includes(integration.provider) || !integration.connectedAccountId) throw new BadRequestException('Invalid email connection');
    const account = { firebaseId, connectedAccountId: integration.connectedAccountId, environment: this.composio.environment(), ...(integration.provider === IntegrationProvider.MICROSOFT ? { toolkit: 'outlook' as const } : {}) };
    // Local revocation stops new reads immediately. Remote failure remains retryable via DELETE.
    await this.integrations.disconnect(integrationId);
    await this.composio.remove(account);
    for (const id of integration.retiredConnectedAccountIds || []) await this.composio.remove({ ...account, connectedAccountId: id });
    await this.integrations.clearRetiredConnections(integrationId, account.connectedAccountId);
    await this.integrations.finishRemoteDisconnect(integrationId);
  }
}
