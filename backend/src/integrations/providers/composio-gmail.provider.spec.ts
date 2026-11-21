import { ComposioGmailProvider } from './composio-gmail.provider';
import { IntegrationStatus } from '../enums/integrations.enums';

describe('Composio Gmail response normalization', () => {
  const account = { firebaseId: 'user-a', connectedAccountId: 'ca-a', environment: 'dev' };
  let execute: jest.Mock;
  let integrations: any;
  let downloads: any;
  let provider: ComposioGmailProvider;
  beforeEach(() => {
    execute = jest.fn();
    integrations = { findByConnectedAccountId: jest.fn().mockResolvedValue({ status: IntegrationStatus.ACTIVE, connectionBackend: 'COMPOSIO' }) };
    downloads = { download: jest.fn().mockResolvedValue(Buffer.from('bytes')) };
    provider = new ComposioGmailProvider({ execute } as any, integrations, downloads);
  });
  it('lists IDs only and preserves opaque pagination', async () => {
    execute.mockResolvedValue({ messages: [{ messageId: '123' }], nextPageToken: 'opaque' });
    expect(await provider.listMessages(account, 'has:attachment', 100)).toEqual({ ids: ['123'], nextPageToken: 'opaque' });
    expect(execute).toHaveBeenCalledWith(account, 'GMAIL_FETCH_EMAILS', { query: 'has:attachment', ids_only: true, max_results: 100 });
  });
  it('fails on a partial/unusable message instead of silently omitting it', async () => {
    execute.mockResolvedValue({ messages: [{}] });
    await expect(provider.listMessages(account, '', 100)).rejects.toMatchObject({ category: 'CONTRACT' });
  });
  it('requires a full payload for the selected message', async () => {
    execute.mockResolvedValue({ messageId: '123', payload: null });
    await expect(provider.getMessage(account, '123')).rejects.toMatchObject({ category: 'CONTRACT' });
  });
  it('keeps nested MIME parts for the existing receipt filter', async () => {
    const payload = { parts: [{ parts: [{ filename: 'invoice.pdf', body: { attachmentId: 'att-1' } }] }] };
    execute.mockResolvedValue({ messageId: '123', payload, subject: 'invoice', messageText: 'receipt' });
    expect((await provider.getMessage(account, '123')).payload.parts).toEqual(payload.parts);
    expect(execute).toHaveBeenCalledWith(account, 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', { message_id: '123', format: 'full' });
  });
  it('downloads the descriptor URL without exposing it to the importer', async () => {
    execute.mockResolvedValue({ file: { s3url: 'https://download.example/file?signature=secret' } });
    expect(await provider.downloadAttachment(account, '123', 'att-1', 'invoice.pdf')).toEqual(Buffer.from('bytes'));
    expect(execute).toHaveBeenCalledWith(account, 'GMAIL_GET_ATTACHMENT', { message_id: '123', attachment_id: 'att-1', file_name: 'invoice.pdf' });
  });
  it('stops reads immediately after local disconnection', async () => {
    integrations.findByConnectedAccountId.mockResolvedValue(null);
    await expect(provider.getMessage(account, '123')).rejects.toMatchObject({ category: 'AUTH' });
    expect(execute).not.toHaveBeenCalled();
  });
});
