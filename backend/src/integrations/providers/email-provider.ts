/** Provider-neutral read boundary. No write/proxy/tool-execution API is exposed. */
export interface EmailPart {
  filename?: string;
  mimeType?: string;
  headers?: { name?: string; value?: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: EmailPart[];
}

export interface EmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  payload: EmailPart;
}

export interface EmailAccountContext {
  firebaseId: string;
  connectedAccountId: string;
  environment: string;
}

export abstract class EmailProvider {
  abstract listMessages(account: EmailAccountContext, query: string, limit: number, cursor?: string):
    Promise<{ ids: string[]; nextPageToken?: string }>;
  abstract getMessage(account: EmailAccountContext, messageId: string): Promise<EmailMessage>;
  abstract downloadAttachment(account: EmailAccountContext, messageId: string, attachmentId: string, filename: string): Promise<Buffer>;
}
