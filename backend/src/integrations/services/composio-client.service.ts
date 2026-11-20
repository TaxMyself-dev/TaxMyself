import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { EmailAccountContext } from '../providers/email-provider';
import { EmailProviderError } from '../providers/email-provider.error';

export const GMAIL_READ_TOOLS = [
  'GMAIL_FETCH_EMAILS', 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
  'GMAIL_GET_ATTACHMENT', 'GMAIL_WHO_AM_I',
] as const;
export type GmailReadTool = typeof GMAIL_READ_TOOLS[number];

interface ConnectedAccount {
  id: string;
  status: string;
  isDisabled: boolean;
  toolkit: { slug: string };
  authConfig: { id: string; isComposioManaged: boolean; isDisabled: boolean };
}

/** Small SDK seam for deterministic unit tests; never expose the SDK to callers. */
export interface ComposioSdk {
  connectedAccounts: {
    link(userId: string, authConfigId: string, options: { callbackUrl: string; allowMultiple: boolean }): Promise<{ id: string; redirectUrl: string }>;
    list(options: { userIds: string[]; authConfigIds: string[]; toolkitSlugs: string[]; cursor?: string; limit: number }): Promise<{ items: ConnectedAccount[]; nextCursor?: string }>;
    delete(id: string): Promise<unknown>;
  };
  tools: { execute(slug: string, body: { userId: string; connectedAccountId: string; version: string; arguments: Record<string, unknown> }, options: { signal: AbortSignal }): Promise<unknown> };
}

export function objectValue(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EmailProviderError('CONTRACT');
  return value as Record<string, any>;
}

@Injectable()
export class ComposioClientService {
  private sdk?: ComposioSdk;

  environment(): string {
    const environment = process.env.COMPOSIO_ENVIRONMENT;
    if (!['dev', 'prod'].includes(environment)) throw new EmailProviderError('CONFIG');
    if (process.env.NODE_ENV !== 'production' && environment === 'prod') throw new EmailProviderError('CONFIG');
    return environment;
  }

  assertEnabled(): void {
    this.environment();
  }

  userId(firebaseId: string): string {
    return `keepintax:${this.environment()}:${createHash('sha256').update(firebaseId).digest('hex')}`;
  }

  authConfigId(): string {
    const value = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
    if (!value) throw new EmailProviderError('CONFIG');
    return value;
  }

  protected client(): ComposioSdk {
    this.assertEnabled();
    if (!this.sdk) {
      const apiKey = process.env.COMPOSIO_API_KEY;
      if (!apiKey) throw new EmailProviderError('CONFIG');
      // Lazy loading keeps an unconfigured integration inert. SDK 0.29 requires Node >=22.22.3.
      const { Composio } = require('@composio/core');
      this.sdk = new Composio({ apiKey, dangerouslyAllowAutoUploadDownloadFiles: false });
    }
    return this.sdk;
  }

  async link(firebaseId: string, callbackUrl: string): Promise<{ id: string; redirectUrl: string }> {
    try {
      const result = await this.client().connectedAccounts.link(this.userId(firebaseId), this.authConfigId(), { callbackUrl, allowMultiple: true });
      const url = new URL(result.redirectUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'connect.composio.dev' || !result.id) throw new EmailProviderError('CONTRACT');
      return result;
    } catch (error) { throw this.safeError(error); }
  }

  async assertAccount(account: EmailAccountContext, requireActive = true): Promise<boolean> {
    if (account.environment !== this.environment() || !account.connectedAccountId) throw new EmailProviderError('AUTH');
    try {
      // get(id) does not return user ownership. A user-scoped list proves membership.
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await this.client().connectedAccounts.list({ userIds: [this.userId(account.firebaseId)], authConfigIds: [this.authConfigId()], toolkitSlugs: ['gmail'], cursor, limit: 100 });
        const match = page.items.find(item => item.id === account.connectedAccountId);
        if (match) {
          if (match.toolkit.slug !== 'gmail' || match.authConfig.id !== this.authConfigId() || !match.authConfig.isComposioManaged || (requireActive && (match.authConfig.isDisabled || match.status !== 'ACTIVE' || match.isDisabled))) throw new EmailProviderError('AUTH');
          return true;
        }
        cursor = page.nextCursor || undefined;
        if (cursor && seen.has(cursor)) throw new EmailProviderError('CONTRACT');
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (!requireActive) return false;
      throw new EmailProviderError('AUTH');
    } catch (error) { throw this.safeError(error); }
  }

  async execute(account: EmailAccountContext, tool: GmailReadTool, args: Record<string, unknown>): Promise<Record<string, any>> {
    if (!(GMAIL_READ_TOOLS as readonly string[]).includes(tool)) throw new EmailProviderError('AUTH');
    await this.assertAccount(account);
    const version = process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION;
    if (!version || !/^\d{8}_\d+$/.test(version)) throw new EmailProviderError('CONFIG');
    for (let attempt = 0; ; attempt++) {
      try {
        const result = objectValue(await this.client().tools.execute(tool, {
          userId: this.userId(account.firebaseId), connectedAccountId: account.connectedAccountId,
          version, arguments: { ...args, ...(tool === 'GMAIL_WHO_AM_I' ? {} : { user_id: 'me' }) },
        }, { signal: AbortSignal.timeout(30_000) }));
        if (result.successful !== true) {
          const reason = typeof result.error === 'string' ? result.error.toLowerCase() : '';
          throw new EmailProviderError(/invalid_grant|unauthorized|authorization.*expired|authentication.*required/.test(reason) ? 'AUTH' : 'TRANSIENT');
        }
        return objectValue(result.data);
      } catch (error) {
        const safe = this.safeError(error);
        if (!['RATE_LIMIT', 'TRANSIENT'].includes(safe.category) || attempt >= 2) throw safe;
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
  }

  async remove(account: EmailAccountContext): Promise<void> {
    if (!await this.assertAccount(account, false)) return;
    try { await this.client().connectedAccounts.delete(account.connectedAccountId); }
    catch (error) { if (this.safeError(error).category !== 'NOT_FOUND') throw this.safeError(error); }
  }

  private safeError(error: unknown): EmailProviderError {
    if (error instanceof EmailProviderError) return error;
    const status = Number((error as { status?: number })?.status);
    return new EmailProviderError(status === 401 || status === 403 ? 'AUTH' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMIT' : 'TRANSIENT');
  }
}
