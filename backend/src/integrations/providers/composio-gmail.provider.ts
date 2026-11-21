import { Injectable } from '@nestjs/common';
import { UserIntegrationsService } from '../services/user-integrations.service';
import { ComposioClientService, GmailReadTool, objectValue } from '../services/composio-client.service';
import { IntegrationStatus } from '../enums/integrations.enums';
import { EmailAccountContext, EmailMessage, EmailPart, EmailProvider } from './email-provider';
import { EmailProviderError } from './email-provider.error';
import { EmailAttachmentDownloadService } from '../services/email-attachment-download.service';

@Injectable()
export class ComposioGmailProvider extends EmailProvider {
  constructor(private readonly composio: ComposioClientService, private readonly integrations: UserIntegrationsService, private readonly downloads: EmailAttachmentDownloadService) { super(); }

  private async assertLocalAccount(account: EmailAccountContext): Promise<void> {
    const row = await this.integrations.findByConnectedAccountId(account.connectedAccountId, account.firebaseId);
    if (!row || row.status !== IntegrationStatus.ACTIVE || row.connectionBackend !== 'COMPOSIO') throw new EmailProviderError('AUTH');
  }

  private async read(account: EmailAccountContext, tool: GmailReadTool, args: Record<string, unknown>): Promise<Record<string, any>> {
    await this.assertLocalAccount(account);
    try { return await this.composio.execute(account, tool, args); }
    catch (error) {
      if (error instanceof EmailProviderError && error.category === 'AUTH') {
        await this.integrations.expireConnectedAccount(account.connectedAccountId, account.firebaseId);
      }
      throw error;
    }
  }

  async listMessages(account: EmailAccountContext, query: string, limit: number, cursor?: string): Promise<{ ids: string[]; nextPageToken?: string }> {
    const data = await this.read(account, 'GMAIL_FETCH_EMAILS', { query, ids_only: true, max_results: limit, ...(cursor ? { page_token: cursor } : {}) });
    if (!Array.isArray(data.messages)) throw new EmailProviderError('CONTRACT');
    const ids = data.messages.map(item => {
      const id = objectValue(item).messageId;
      if (typeof id !== 'string' || !id) throw new EmailProviderError('CONTRACT');
      return id;
    });
    if (data.nextPageToken != null && typeof data.nextPageToken !== 'string') throw new EmailProviderError('CONTRACT');
    return { ids, nextPageToken: data.nextPageToken || undefined };
  }

  async getMessage(account: EmailAccountContext, messageId: string): Promise<EmailMessage> {
    const data = await this.read(account, 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', { message_id: messageId, format: 'full' });
    if (data.messageId !== messageId) throw new EmailProviderError('CONTRACT');
    const payload = objectValue(data.payload) as EmailPart;
    if (!Array.isArray(payload.parts) && !payload.body && !Array.isArray(payload.headers)) throw new EmailProviderError('CONTRACT');
    const headers = [...(payload.headers || [])];
    for (const [name, value] of [['Subject', data.subject], ['From', data.sender], ['Date', data.messageTimestamp]]) {
      if (typeof value === 'string' && !headers.some(header => header.name?.toLowerCase() === name.toLowerCase())) headers.push({ name, value });
    }
    // Fail closed if full MIME is absent; attachmentList's untyped items are not a substitute.
    return { id: messageId, threadId: data.threadId, snippet: typeof data.preview?.body === 'string' ? data.preview.body : (typeof data.messageText === 'string' ? data.messageText : undefined), payload: { ...payload, headers } };
  }

  async downloadAttachment(account: EmailAccountContext, messageId: string, attachmentId: string, filename: string): Promise<Buffer> {
    const data = await this.read(account, 'GMAIL_GET_ATTACHMENT', { message_id: messageId, attachment_id: attachmentId, file_name: filename });
    const file = objectValue(data.file);
    if (typeof file.s3url !== 'string') throw new EmailProviderError('CONTRACT');
    return this.downloads.download(file.s3url);
  }
}
