import { ComposioOutlookProvider, outlookDateFilter } from './composio-outlook.provider';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';
import { EmailProviderError } from './email-provider.error';

describe('Outlook read adapter', () => {
  const account = { firebaseId: 'owner', connectedAccountId: 'ca-outlook', environment: 'dev', toolkit: 'outlook' as const };
  let client: any, integrations: any, downloads: any, provider: ComposioOutlookProvider;
  beforeEach(() => {
    client = { execute: jest.fn() };
    integrations = { findByConnectedAccountId: jest.fn().mockResolvedValue({ provider: IntegrationProvider.MICROSOFT, status: IntegrationStatus.ACTIVE, connectionBackend: 'COMPOSIO' }), expireConnectedAccount: jest.fn() };
    downloads = { download: jest.fn().mockResolvedValue(Buffer.from('receipt')) };
    provider = new ComposioOutlookProvider(client, integrations, downloads);
  });
  it('translates inclusive calendar range into exclusive Graph bounds', () => {
    expect(outlookDateFilter('has:attachment after:2025/12/31 before:2026/01/02')).toBe('receivedDateTime ge 2025-12-31T00:00:00.000Z and receivedDateTime lt 2026-01-02T00:00:00.000Z');
    expect(outlookDateFilter('has:attachment after:1767225600 before:1767312000')).toContain('receivedDateTime ge 2026-01-01');
  });
  it('rejects unsupported queries rather than scanning outside the requested range', () => {
    expect(() => outlookDateFilter('has:attachment subject:receipt')).toThrow();
  });
  it('lists all folders and forwards opaque pagination tokens', async () => {
    client.execute.mockResolvedValue({ value: [{ id: 'm1' }], next_page_token: 'opaque' });
    expect(await provider.listMessages(account, 'has:attachment after:1767225600', 50, 'page2')).toEqual({ ids: ['m1'], nextPageToken: 'opaque' });
    expect(client.execute).toHaveBeenCalledWith(account, 'OUTLOOK_LIST_MESSAGES', expect.objectContaining({ folder: 'allfolders', page_token: 'page2', top: 50 }));
  });
  it('fails on an unpageable response instead of marking a partial scan complete', async () => {
    client.execute.mockResolvedValue({ value: [], '@odata.nextLink': 'more' });
    await expect(provider.listMessages(account, 'has:attachment after:1767225600', 50)).rejects.toMatchObject({category:'CONTRACT'});
  });
  it('normalizes file attachments and message metadata, excluding linked/embedded items', async () => {
    client.execute.mockResolvedValueOnce({ id: 'm1', subject: 'invoice', from: { emailAddress: { address: 'sender@example.com' } }, bodyPreview: 'receipt', conversationId: 'thread' }).mockResolvedValueOnce({ response_data: { value: [
      { '@odata.type': '#microsoft.graph.fileAttachment', id: 'a2', name: 'receipt.pdf', contentType: 'application/pdf', size: 8 },
      { '@odata.type': '#microsoft.graph.itemAttachment', id: 'a1', name: 'embedded' },
    ] } });
    const result = await provider.getMessage(account, 'm1');
    expect(result.threadId).toBe('thread');
    expect(result.payload.parts).toHaveLength(1);
    expect(result.payload.parts[0].body.attachmentId).toBe('a2');
    expect(result.payload.headers).toContainEqual({name:'From',value:'sender@example.com'});
  });
  it('uses the existing bounded download boundary for signed files', async () => {
    client.execute.mockResolvedValue({ file: { s3url: 'https://allowed.example/file' } });
    expect(await provider.downloadAttachment(account, 'm1', 'a1', 'receipt.pdf')).toEqual(Buffer.from('receipt'));
    expect(downloads.download).toHaveBeenCalledWith('https://allowed.example/file');
  });
  it('rejects a Google row or local revocation before reading', async () => {
    integrations.findByConnectedAccountId.mockResolvedValue({ provider: IntegrationProvider.GOOGLE, status: IntegrationStatus.ACTIVE, connectionBackend: 'COMPOSIO' });
    await expect(provider.getMessage(account, 'm1')).rejects.toMatchObject({category:'AUTH'});
    expect(client.execute).not.toHaveBeenCalled();
  });
  it('expires only the failed connected account on authentication failure', async () => {
    client.execute.mockRejectedValue(new EmailProviderError('AUTH'));
    await expect(provider.getMessage(account, 'm1')).rejects.toThrow();
    expect(integrations.expireConnectedAccount).toHaveBeenCalledWith('ca-outlook', 'owner');
  });
});
