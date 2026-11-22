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
    const first=await provider.listMessages(account, 'has:attachment', 100);
    expect(first).toEqual({ ids: ['123'], nextPageToken: expect.stringMatching(/^email-rules-v1\./) });
    expect(execute).toHaveBeenCalledWith(account, 'GMAIL_FETCH_EMAILS', { query: 'has:attachment', ids_only: true, max_results: 100 });
    await provider.listMessages(account,'has:attachment',100,first.nextPageToken);
    expect(execute.mock.calls[1][2].page_token).toBe('opaque');
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
  it('reloads every rule before each read, and blocks an attachment before executing', async () => {
    integrations.findByConnectedAccountId.mockResolvedValue({status:'ACTIVE',connectionBackend:'COMPOSIO',emailRouting:{businessNumber:'123',rules:[
      {sender:'a@example.com',action:'BUSINESS',businessNumber:'123'},
      {sender:'a@example.com',action:'BLOCK'},
    ]}});
    await expect(provider.downloadAttachment({...account,senderEmail:'A <a@example.com>'},'123','att','invoice.pdf')).rejects.toThrow('EMAIL_SENDER_BLOCKED');
    expect(execute).not.toHaveBeenCalled();
    expect(downloads.download).not.toHaveBeenCalled();
  });
  it('applies all exclusions and requires a fresh cursor after a rule change', async () => {
    integrations.findByConnectedAccountId.mockResolvedValue({status:'ACTIVE',connectionBackend:'COMPOSIO',emailRouting:{rules:[{sender:'a@example.com',action:'BLOCK'},{sender:'b@example.com',action:'BLOCK'}]}});
    execute.mockResolvedValue({messages:[]});
    await provider.listMessages(account,'has:attachment',50);
    expect(execute.mock.calls[0][2].query).toBe('has:attachment -from:(a@example.com) -from:(b@example.com)');
    execute.mockClear();
    await expect(provider.listMessages(account,'has:attachment',50,'old-cursor')).rejects.toThrow('EMAIL_RULES_CHANGED');
    expect(execute).not.toHaveBeenCalled();
  });
  it('checks a newly available sender before returning MIME parts', async () => {
    integrations.findByConnectedAccountId.mockResolvedValue({status:'ACTIVE',connectionBackend:'COMPOSIO',emailRouting:{rules:[{sender:'a@example.com',action:'BLOCK'}]}});
    execute.mockResolvedValue({messageId:'123',sender:'A <a@example.com>',payload:{body:{data:'YQ'}}});
    await expect(provider.getMessage(account,'123')).rejects.toThrow('EMAIL_SENDER_BLOCKED');
  });
  it('honors a rule added after the attachment descriptor but before downloading its bytes',async()=>{
    const active={status:'ACTIVE',connectionBackend:'COMPOSIO'};
    integrations.findByConnectedAccountId.mockResolvedValueOnce(active).mockResolvedValueOnce({...active,emailRouting:{rules:[{sender:'a@example.com',action:'BLOCK'}]}});
    execute.mockResolvedValue({file:{s3url:'https://download.example/descriptor'}});
    await expect(provider.downloadAttachment({...account,senderEmail:'a@example.com'},'123','attachment','invoice.pdf')).rejects.toThrow('EMAIL_SENDER_BLOCKED');
    expect(execute).toHaveBeenCalledTimes(1);expect(downloads.download).not.toHaveBeenCalled();
  });
  it('preserves the original query and invalidates the bound cursor after a rule is removed',async()=>{
    const active={status:'ACTIVE',connectionBackend:'COMPOSIO',emailRouting:{rules:[{sender:'blocked@example.com',action:'BLOCK'}]}};
    integrations.findByConnectedAccountId.mockResolvedValue(active);
    execute.mockResolvedValue({messages:[],nextPageToken:'remote-cursor'});
    const base='has:attachment -from:(user-filter@example.com)';
    const first=await provider.listMessages(account,base,50);
    expect(execute.mock.calls[0][2].query).toBe(base+' -from:(blocked@example.com)');
    integrations.findByConnectedAccountId.mockResolvedValue({...active,emailRouting:{rules:[]}});execute.mockClear();
    await expect(provider.listMessages(account,base,50,first.nextPageToken)).rejects.toMatchObject({query:base});
    expect(execute).not.toHaveBeenCalled();
    await provider.listMessages(account,base,50);expect(execute.mock.calls[0][2].query).toBe(base);
  });
  it('does not bypass blocking rules when source metadata lacks a usable sender',async()=>{
    integrations.findByConnectedAccountId.mockResolvedValue({status:'ACTIVE',connectionBackend:'COMPOSIO',emailRouting:{rules:[{sender:'blocked@example.com',action:'BLOCK'}]}});
    execute.mockResolvedValue({messageId:'123',payload:{parts:[]}});
    await expect(provider.getMessage(account,'123')).rejects.toMatchObject({category:'CONTRACT'});
    execute.mockClear();await expect(provider.downloadAttachment(account,'123','att','invoice.pdf')).rejects.toMatchObject({category:'CONTRACT'});
    expect(execute).not.toHaveBeenCalled();
  });
});
