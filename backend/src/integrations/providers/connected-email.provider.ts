import { Injectable } from '@nestjs/common';
import { EmailAccountContext, EmailProvider } from './email-provider';
import { ComposioGmailProvider } from './composio-gmail.provider';
import { ComposioOutlookProvider } from './composio-outlook.provider';

@Injectable()
export class ConnectedEmailProvider extends EmailProvider {
  constructor(private readonly gmail: ComposioGmailProvider, private readonly outlook: ComposioOutlookProvider) { super(); }
  private provider(account: EmailAccountContext): EmailProvider { return account.toolkit === 'outlook' ? this.outlook : this.gmail; }
  listMessages(account: EmailAccountContext, query: string, limit: number, cursor?: string) { return this.provider(account).listMessages(account, query, limit, cursor); }
  getMessage(account: EmailAccountContext, id: string) { return this.provider(account).getMessage(account, id); }
  downloadAttachment(account: EmailAccountContext, id: string, attachment: string, filename: string) { return this.provider(account).downloadAttachment(account, id, attachment, filename); }
}
