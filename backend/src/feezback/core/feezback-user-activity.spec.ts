import { Logger } from '@nestjs/common';
import { of, throwError, lastValueFrom, defer } from 'rxjs';
import { FeezbackHttpClient } from './feezback-http.client';
import { FeezbackConsentApiService } from '../consent/feezback-consent-api.service';
import { normalizePsuIp, resolvePsuIp, withFeezbackUserActivity, PSU_IP_HEADER } from './feezback-user-activity';
import { FeezbackUserActivityInterceptor } from './feezback-user-activity.interceptor';

jest.mock('./feezback-retry.utils', () => ({
  ...jest.requireActual('./feezback-retry.utils'), sleep: jest.fn().mockResolvedValue(undefined),
}));

const base = 'https://proxy.test/proxy/feezback';
const owner = (id = 'owner', ip = '203.0.113.7'): any => ({
  user: { firebaseId: id, actorFirebaseId: id, role: 'user' },
  headers: {}, socket: { remoteAddress: ip },
});
const dataUrl = (id = 'owner', kind = 'consents') =>
  `${base}/tpp/v1/users/${id}_sub@KNCAXnwXk1/${kind}`;

describe('Feezback PSU activity context', () => {
  let http: any, auth: any, client: FeezbackHttpClient;
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.K_SERVICE;
    http = { get: jest.fn(() => of({ status: 200, data: {}, headers: {} })),
      post: jest.fn(() => of({ status: 200, data: {}, headers: {} })),
      delete: jest.fn(() => of({ status: 204, data: {}, headers: {} })) };
    auth = { getTppId: () => 'KNCAXnwXk1', getTppApiUrl: () => base, getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer test' }) };
    client = new FeezbackHttpClient(http, auth);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

  it.each(['consents', 'accounts', 'cards', 'consents/c/accounts/a/transactions', 'consents/c/cards/r/balances'])
  ('marks owner data reads, including cached reads: %s', async kind => {
    await withFeezbackUserActivity(owner(), () => client.get(dataUrl('owner', kind),
      { sub: 'owner_sub', params: { preventUpdate: true } }));
    expect(http.get.mock.calls[0][1].headers[PSU_IP_HEADER]).toBe('203.0.113.7');
  });

  it('normalizes IPv4-mapped addresses and accepts IPv6 without zone identifiers', () => {
    expect(normalizePsuIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizePsuIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizePsuIp('fe80::1%eth0')).toBeUndefined();
  });
  it.each(['', 'unknown', '999.1.2.3', '1.2.3.4, 5.6.7.8', '1.2.3.4\r\nInjected: value', undefined])
  ('omits invalid/missing client IP: %s', async ip => {
    const req = owner(); req.socket.remoteAddress = ip;
    await withFeezbackUserActivity(req, () => client.get(dataUrl(), { sub: 'owner_sub' }));
    expect(http.get.mock.calls[0][1].headers[PSU_IP_HEADER]).toBeUndefined();
  });
  it('ignores untrusted forwarding, browser-supplied PSU and request-body IPs', () => {
    const req = owner(); req.headers = { 'x-forwarded-for': '198.51.100.9', 'x-psu-ip-address': '192.0.2.9' };
    req.body = { ip: '192.0.2.8' };
    expect(resolvePsuIp(req)).toBe('203.0.113.7');
  });
  it('uses the Cloud Run appended hop and omits a missing/malformed forwarded IP', () => {
    process.env.K_SERVICE = 'local-test';
    const req = owner(); req.headers['x-forwarded-for'] = '192.0.2.99, 198.51.100.7';
    expect(resolvePsuIp(req)).toBe('198.51.100.7');
    delete req.headers['x-forwarded-for']; expect(resolvePsuIp(req)).toBeUndefined();
    req.headers['x-forwarded-for'] = ['198.51.100.7']; expect(resolvePsuIp(req)).toBeUndefined();
  });
  it.each([
    { user: undefined }, { user: { firebaseId: 'owner' } },
    { user: { firebaseId: 'owner', actorFirebaseId: 'admin' } },
    { isAdminImpersonation: true }, { isDelegatedAccess: true },
  ])('does not count unauthenticated/delegated/admin requests: %j', async overrides => {
    await withFeezbackUserActivity({ ...owner(), ...overrides }, () => client.get(dataUrl(), { sub: 'owner_sub' }));
    expect(http.get.mock.calls[0][1].headers[PSU_IP_HEADER]).toBeUndefined();
  });
  it('never marks background data reads, even if an options header was supplied', async () => {
    await client.get(dataUrl(), { sub: 'owner_sub', headers: { 'x-psu-ip-address': '192.0.2.1' } });
    expect(Object.keys(http.get.mock.calls[0][1].headers).some(k => k.toLowerCase() === PSU_IP_HEADER.toLowerCase())).toBe(false);
  });
  it('never marks token/link calls, mutations, another user or another host', async () => {
    await withFeezbackUserActivity(owner(), async () => {
      await client.post(base + '/token', {}, { sub: 'owner_sub' });
      await client.post(base + '/link', {}, { sub: 'owner_sub' });
      await client.delete(dataUrl() + '/c', { sub: 'owner_sub' });
      await client.get(dataUrl('another'), { sub: 'another_sub' });
      await client.get(dataUrl('another'), { sub: 'owner_sub' });
      await client.get(dataUrl().replace('proxy.test', 'other.test'), { sub: 'owner_sub' });
    });
    for (const method of ['get', 'post', 'delete']) for (const call of http[method].mock.calls) {
      expect(call[method === 'post' ? 2 : 1].headers[PSU_IP_HEADER]).toBeUndefined();
    }
  });
  it('supports the owned spouse identity without matching other owners', async () => {
    await withFeezbackUserActivity(owner(), () => client.get(dataUrl().replace('_sub@', '_sub_spouse@'), { sub: 'owner_sub_spouse' }));
    expect(http.get.mock.calls[0][1].headers[PSU_IP_HEADER]).toBe('203.0.113.7');
  });
  it('isolates overlapping users, delayed work and independent background requests', async () => {
    let resume!: () => void; const gate = new Promise<void>(r => resume = r);
    const first = withFeezbackUserActivity(owner('first', '203.0.113.1'), async () => {
      await gate; await client.get(dataUrl('first'), { sub: 'first_sub' });
    });
    await withFeezbackUserActivity(owner('second', '203.0.113.2'), () => client.get(dataUrl('second'), { sub: 'second_sub' }));
    await client.get(dataUrl(), { sub: 'owner_sub' });
    resume(); await first;
    expect(http.get.mock.calls.map(c => c[1].headers[PSU_IP_HEADER])).toEqual(['203.0.113.2', undefined, '203.0.113.1']);
  });
  it('retains the same IP on provider retries and redacts it from diagnostics', async () => {
    http.get.mockImplementationOnce(() => throwError(() => ({ isAxiosError: true, message: 'retry',
      response: { status: 503, data: { echoed: '203.0.113.7' }, headers: {} } })));
    const trace = await withFeezbackUserActivity(owner(), () => client.withDebugTrace(() => client.get(dataUrl(), { sub: 'owner_sub' })));
    expect(http.get.mock.calls).toHaveLength(2);
    expect(http.get.mock.calls.every(c => c[1].headers[PSU_IP_HEADER] === '203.0.113.7')).toBe(true);
    expect(JSON.stringify(trace.httpCalls)).not.toContain('203.0.113.7');
    expect(JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls)).not.toContain('203.0.113.7');
  });
  it('retains the owner IP across V2 transaction pagination', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ transactionId: String(i) }));
    http.get.mockReturnValueOnce(of({ status: 200, data: { transactions: { booked: rows } } }))
      .mockReturnValueOnce(of({ status: 200, data: { transactions: { booked: [] } } }));
    const api = new FeezbackConsentApiService(client, auth);
    await withFeezbackUserActivity(owner(), () => api.getAccountTransactionsByConsent('owner_sub', 'c', 'r'));
    expect(http.get.mock.calls).toHaveLength(2);
    expect(http.get.mock.calls.every(c => c[1].headers[PSU_IP_HEADER] === '203.0.113.7')).toBe(true);
    expect(http.get.mock.calls[1][0]).toContain('page=1');
  });
  it('scopes Observable subscriptions and descendant fire-and-forget work after response', async () => {
    const interceptor = new FeezbackUserActivityInterceptor(); let done!: () => void;
    const finished = new Promise<void>(r => done = r);
    const context: any = { switchToHttp: () => ({ getRequest: () => owner() }) };
    const stream = interceptor.intercept(context, { handle: () => defer(async () => {
      setImmediate(() => { void client.get(dataUrl(), { sub: 'owner_sub' }).then(done); });
      return 'started';
    }) });
    expect(await lastValueFrom(stream)).toBe('started'); await finished;
    expect(http.get.mock.calls[0][1].headers[PSU_IP_HEADER]).toBe('203.0.113.7');
    await client.get(dataUrl(), { sub: 'owner_sub' });
    expect(http.get.mock.calls[1][1].headers[PSU_IP_HEADER]).toBeUndefined();
  });
});
