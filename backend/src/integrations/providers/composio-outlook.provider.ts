import { EmailRuleBlockedError, evaluateSender, routingSettings, senderAddress } from '../../email-intake/email-routing.policy';
import { Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';
import { UserIntegrationsService } from '../services/user-integrations.service';
import { ComposioClientService, OutlookReadTool, objectValue } from '../services/composio-client.service';
import { EmailAttachmentDownloadService } from '../services/email-attachment-download.service';
import { EmailAccountContext, EmailMessage, EmailProvider } from './email-provider';
import { EmailProviderError } from './email-provider.error';

/** Translate only the shared intake's date grammar; arbitrary Gmail queries fail closed. */
export function outlookDateFilter(query: string, now = Date.now()): string {
  const clauses: string[] = [];
  for (const token of query.trim().split(/\s+/)) {
    if (token === 'has:attachment') continue;
    if (token === 'newer_than:90d') { clauses.push('receivedDateTime ge ' + new Date(now - 90 * 86400000).toISOString()); continue; }
    const match = /^(after|before):([0-9]+|[0-9]{4}\/[0-9]{2}\/[0-9]{2})$/.exec(token);
    if (!match) throw new EmailProviderError('CONTRACT');
    const date = match[2].includes('/') ? new Date(match[2].replace(/\//g, '-') + 'T00:00:00Z') : new Date(Number(match[2]) * 1000);
    if (!Number.isFinite(date.getTime())) throw new EmailProviderError('CONTRACT');
    clauses.push('receivedDateTime ' + (match[1] === 'after' ? 'ge ' : 'lt ') + date.toISOString());
  }
  if (!clauses.length) throw new EmailProviderError('CONTRACT');
  // Do not filter hasAttachments: Graph excludes messages containing inline files only.
  return clauses.join(' and ');
}

@Injectable()
export class ComposioOutlookProvider extends EmailProvider {
  constructor(private readonly composio: ComposioClientService, private readonly integrations: UserIntegrationsService, private readonly downloads: EmailAttachmentDownloadService) { super(); }

  private async assertLocalAccount(account: EmailAccountContext, requireSender=false):Promise<void> {
    const row=await this.integrations.findByConnectedAccountId(account.connectedAccountId, account.firebaseId);
    if(account.toolkit!=='outlook'||!row||row.provider!==IntegrationProvider.MICROSOFT||row.status!==IntegrationStatus.ACTIVE||row.connectionBackend!=='COMPOSIO')throw new EmailProviderError('ACCESS');
    const settings=routingSettings(row.emailRouting);
    if(requireSender&&settings.rules.some(rule=>rule.action==='BLOCK')&&!senderAddress(account.senderEmail))throw new EmailProviderError('CONTRACT');
    if(evaluateSender(settings,account.senderEmail).blocked)throw new EmailRuleBlockedError();
  }

  private async read(account: EmailAccountContext, tool: OutlookReadTool, args: Record<string, unknown>) {
    await this.assertLocalAccount(account,tool==='OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT');
    try { return await this.composio.execute(account, tool, args); }
    catch (error) {
      if (error instanceof EmailProviderError && error.category === 'AUTH') await this.integrations.expireConnectedAccount(account.connectedAccountId, account.firebaseId);
      throw error;
    }
  }

  async listMessages(account: EmailAccountContext, query: string, limit: number, cursor?: string) {
    const data = await this.read(account, 'OUTLOOK_LIST_MESSAGES', {
      folder: 'allfolders', top: Math.min(500, limit), select: ['id'],
      filter: outlookDateFilter(query), orderby: ['receivedDateTime desc'],
      ...(cursor ? { page_token: cursor } : {}),
    });
    if (!Array.isArray(data.value)) throw new EmailProviderError('CONTRACT');
    if (data.next_page_token != null && typeof data.next_page_token !== 'string') throw new EmailProviderError('CONTRACT');
    if (data['@odata.nextLink'] && !data.next_page_token) throw new EmailProviderError('CONTRACT');
    return { ids: data.value.map(item => { const id = objectValue(item).id; if (typeof id !== 'string' || !id) throw new EmailProviderError('CONTRACT'); return id; }), nextPageToken: data.next_page_token || undefined };
  }

  async getMessage(account: EmailAccountContext, messageId: string): Promise<EmailMessage> {
    const message = await this.read(account, 'OUTLOOK_GET_MESSAGE', { message_id: messageId, select: ['id', 'subject', 'from', 'receivedDateTime', 'conversationId', 'bodyPreview', 'body'] });
    if (message.id !== messageId) throw new EmailProviderError('CONTRACT');
    account={...account,senderEmail:message.from?.emailAddress?.address};
    await this.assertLocalAccount(account,true);
    const response = await this.read(account, 'OUTLOOK_LIST_OUTLOOK_ATTACHMENTS', { message_id: messageId, response_detail: 'minimal' });
    // Both envelopes are explicitly described by the discovered Composio contract.
    const attachments = response.response_data ? objectValue(response.response_data) : response;
    if (!Array.isArray(attachments.value) || attachments['@odata.nextLink']) throw new EmailProviderError('CONTRACT');
    const parts = attachments.value.map(objectValue).filter(item => item['@odata.type'] === '#microsoft.graph.fileAttachment').sort((a, b) => String(a.id).localeCompare(String(b.id))).map(item => {
      if (typeof item.id !== 'string' || !item.id) throw new EmailProviderError('CONTRACT');
      return { filename: typeof item.name === 'string' ? item.name : undefined, mimeType: item.contentType, body: { attachmentId: item.id, size: item.size }, headers: item.isInline ? [{ name: 'Content-Disposition', value: 'inline' }] : [] };
    });
    if(typeof message.body?.content==='string'&&message.body.content.length<=350000){
      parts.push({mimeType:message.body.contentType?.toLowerCase()==='html'?'text/html':'text/plain',body:{data:Buffer.from(message.body.content).toString('base64url')}} as any);
    }
    return { id: messageId, threadId: message.conversationId, snippet: message.bodyPreview, payload: { parts, headers: [
      { name: 'Subject', value: message.subject }, { name: 'From', value: message.from?.emailAddress?.address }, { name: 'Date', value: message.receivedDateTime },
    ] } };
  }

  async downloadAttachment(account: EmailAccountContext, messageId: string, attachmentId: string, filename: string): Promise<Buffer> {
    const data = await this.read(account, 'OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT', { message_id: messageId, attachment_id: attachmentId, file_name: filename });
    const file = objectValue(data.file);
    if (typeof file.s3url !== 'string') throw new EmailProviderError('CONTRACT');
    await this.assertLocalAccount(account,true);
    return this.downloads.download(file.s3url);
  }
}
