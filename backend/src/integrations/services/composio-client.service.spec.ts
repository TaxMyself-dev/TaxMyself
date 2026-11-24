import { ComposioClientService, ComposioSdk } from './composio-client.service';
import { EmailProviderError } from '../providers/email-provider.error';

describe('Composio read-only SDK boundary', () => {
  let service: ComposioClientService;
  let sdk: ComposioSdk;
  const account = { firebaseId: 'user-a', connectedAccountId: 'ca-a', environment: 'dev' };
  const active = { id: 'ca-a', status: 'ACTIVE', isDisabled: false, toolkit: { slug: 'gmail' }, authConfig: { id: 'ac-dev', isComposioManaged: true, isDisabled: false } };
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.COMPOSIO_EMAIL_ENABLED = 'true';
    process.env.COMPOSIO_ENVIRONMENT = 'dev';
    process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = 'ac-dev';
    process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION = '20261105_00';
    sdk = { connectedAccounts: { link: jest.fn(), list: jest.fn().mockResolvedValue({ items: [active] }), delete: jest.fn() }, tools: { execute: jest.fn().mockResolvedValue({ successful: true, data: { messages: [] } }) } };
    service = new ComposioClientService();
    (service as any).sdk = sdk;
  });
  afterAll(() => { process.env = originalEnv; });
  it('uses an explicit account, pinned toolkit and authenticated me', async () => {
    await service.execute(account, 'GMAIL_FETCH_EMAILS', { ids_only: true, user_id: 'other' });
    expect(sdk.connectedAccounts.list).toHaveBeenCalledWith(expect.objectContaining({ userIds: [service.userId('user-a')], authConfigIds: ['ac-dev'] }));
    expect(sdk.tools.execute).toHaveBeenCalledWith('GMAIL_FETCH_EMAILS', expect.objectContaining({ connectedAccountId: 'ca-a', version: '20261105_00', arguments: { ids_only: true, user_id: 'me' } }), expect.anything());
  });
  it('rejects a write tool even if passed outside TypeScript', async () => {
    await expect(service.execute(account, 'GMAIL_SEND_EMAIL' as any, {})).rejects.toMatchObject({ category: 'ACCESS' });
    expect(sdk.tools.execute).not.toHaveBeenCalled();
  });
  it('rejects an account absent from the user-scoped listing', async () => {
    (sdk.connectedAccounts.list as jest.Mock).mockResolvedValue({ items: [] });
    await expect(service.execute(account, 'GMAIL_FETCH_EMAILS', {})).rejects.toMatchObject({ category: 'ACCESS' });
    expect(sdk.tools.execute).not.toHaveBeenCalled();
  });
  it.each([
    { ...active, status: 'EXPIRED' },
    { ...active, isDisabled: true },
    { ...active, authConfig: { ...active.authConfig, id: 'ac-prod' } },
    { ...active, authConfig: { ...active.authConfig, isComposioManaged: false } },
  ])('rejects an invalid connection %j', async invalid => {
    (sdk.connectedAccounts.list as jest.Mock).mockResolvedValue({ items: [invalid] });
    await expect(service.assertAccount(account)).rejects.toMatchObject({ category: invalid.status === 'EXPIRED' ? 'AUTH' : 'ACCESS' });
  });
  it('continues membership lookup over pages', async () => {
    (sdk.connectedAccounts.list as jest.Mock).mockResolvedValueOnce({ items: [], nextCursor: 'page-2' }).mockResolvedValueOnce({ items: [active] });
    await service.assertAccount(account);
    expect(sdk.connectedAccounts.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'page-2' }));
  });
  it('isolates environments before provider access', async () => {
    await expect(service.assertAccount({ ...account, environment: 'prod' })).rejects.toMatchObject({ category: 'ACCESS' });
    expect(sdk.connectedAccounts.list).not.toHaveBeenCalled();
  });
  it('rejects PROD credentials in a non-production runtime even with an initialized SDK', async () => {
    process.env.COMPOSIO_ENVIRONMENT = 'prod';
    process.env.NODE_ENV = 'test';
    await expect(service.assertAccount(account)).rejects.toMatchObject({ category: 'CONFIG' });
  });
  it('does not leak SDK error text or request credentials', async () => {
    (sdk.connectedAccounts.list as jest.Mock).mockRejectedValue({ status: 403, message: 'secret-token', config: { headers: { Authorization: 'secret-token' } } });
    await expect(service.assertAccount(account)).rejects.toEqual(new EmailProviderError('ACCESS', { httpStatus: 403 }));
  });
  it('creates links with intentional multi-account support', async () => {
    (sdk.connectedAccounts.link as jest.Mock).mockResolvedValue({ id: 'ca-new', redirectUrl: 'https://connect.composio.dev/link/test' });
    await service.link('user-a', 'http://localhost:3000/callback?state=opaque');
    expect(sdk.connectedAccounts.link).toHaveBeenCalledWith(service.userId('user-a'), 'ac-dev', expect.objectContaining({ allowMultiple: true }));
  });

  it('treats an absent account as already removed without deleting another user account', async () => {
    (sdk.connectedAccounts.list as jest.Mock).mockResolvedValue({ items: [] });
    await service.remove(account);
    expect(sdk.connectedAccounts.delete).not.toHaveBeenCalled();
  });

  it('bounds rate-limit retries and only retries the allowlisted read', async () => {
    jest.useFakeTimers();
    (sdk.tools.execute as jest.Mock).mockRejectedValue({ status: 429, message: 'signed-secret' });
    const result = service.execute(account, 'GMAIL_FETCH_EMAILS', {}).catch(error => error);
    await jest.runAllTimersAsync();
    expect(await result).toMatchObject({ category: 'RATE_LIMIT', message: 'Email provider failure: RATE_LIMIT' });
    expect(sdk.tools.execute).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
  it('pins Outlook separately and rejects cross-provider and write tools', async () => {
    process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID = 'ac-ms';
    process.env.COMPOSIO_OUTLOOK_TOOLKIT_VERSION = '20261123_00';
    const microsoft = { ...active, toolkit: {slug:'outlook'}, authConfig:{...active.authConfig,id:'ac-ms'} };
    (sdk.connectedAccounts.list as jest.Mock).mockResolvedValue({items:[microsoft]});
    const msAccount = {...account,toolkit:'outlook' as const};
    await service.execute(msAccount,'OUTLOOK_GET_PROFILE',{user_id:'someone-else'});
    expect(sdk.tools.execute).toHaveBeenCalledWith('OUTLOOK_GET_PROFILE',expect.objectContaining({version:'20261123_00',arguments:{user_id:'me'}}),expect.anything());
    await expect(service.execute(msAccount,'GMAIL_FETCH_EMAILS',{})).rejects.toMatchObject({category:'ACCESS'});
    await expect(service.execute(msAccount,'OUTLOOK_SEND_EMAIL' as any,{})).rejects.toMatchObject({category:'ACCESS'});
    (sdk.connectedAccounts.list as jest.Mock).mockResolvedValue({items:[active]});
    await expect(service.assertAccount(msAccount)).rejects.toMatchObject({category:'ACCESS'});
  });

  it('logs only safe operation metadata for platform access denials', async () => {
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    (sdk.tools.execute as jest.Mock).mockRejectedValue({status:403,message:'secret-token owner@example.com https://signed.example/secret'});
    await expect(service.execute(account,'GMAIL_FETCH_EMAILS',{})).rejects.toMatchObject({category:'ACCESS',details:{httpStatus:403}});
    const logs=warn.mock.calls.map(x=>String(x[0])).join(' ');
    expect(logs).toContain('tool_execute'); expect(logs).toContain('403');
    expect(logs).not.toContain('secret');expect(logs).not.toContain('@');expect(logs).not.toContain('https:');
  });
  it.each([['invalid_grant secret-token','AUTH'],['ErrorAccessDenied secret-token','ACCESS'],['unauthorized secret-token','ACCESS']])('distinguishes explicit grant failure from access denial: %s',async(reason,category)=>{
    (sdk.tools.execute as jest.Mock).mockResolvedValue({successful:false,error:reason});
    await expect(service.execute(account,'GMAIL_FETCH_EMAILS',{})).rejects.toMatchObject({category});
  });

});
