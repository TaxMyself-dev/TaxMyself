import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { FeezbackAuthService } from './feezback-auth.service';
import { FeezbackHttpClient } from './feezback-http.client';
import { FeezbackConsentApiService } from '../consent/feezback-consent-api.service';
import { sleep } from './feezback-retry.utils';

jest.mock('./feezback-retry.utils', () => ({
  ...jest.requireActual('./feezback-retry.utils'), sleep: jest.fn().mockResolvedValue(undefined),
}));

const ok = (data: any) => of({ status: 200, data, headers: {}, config: {} });
const denied = (status: number) => throwError(() => ({
  isAxiosError: true, message: 'Provider denied request',
  response: { status, data: { message: 'denied' }, headers: {} },
}));

describe('Feezback access-token lifetime', () => {
  let now: number;
  let http: { post: jest.Mock; get: jest.Mock };
  let auth: FeezbackAuthService;
  beforeEach(() => {
    now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    (sleep as jest.Mock).mockReset().mockResolvedValue(undefined);
    http = { post: jest.fn(), get: jest.fn() };
    auth = new FeezbackAuthService(http as any, {
      generateAccessToken: jest.fn().mockReturnValue('synthetic-signed-jwt'),
    } as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    {}, { expiresIn: 600 }, { expires_in: 600 },
    { expiresIn: 3600 }, { expires_in: 3600 },
    { expiresIn: 0 }, { expiresIn: -1 }, { expiresIn: NaN },
    { expiresIn: Infinity }, { expires_in: Infinity }, { expiresIn: '3600' },
  ])('renews at nine minutes with expiry metadata %p', async metadata => {
    http.post.mockReturnValueOnce(ok({ token: 'first-token', ...metadata }))
      .mockReturnValueOnce(ok({ token: 'renewed-token' }));
    expect(await auth.getAccessToken('owner')).toBe('first-token');
    now += 9 * 60_000 - 1;
    expect(await auth.getAccessToken('owner')).toBe('first-token');
    expect(http.post).toHaveBeenCalledTimes(1);
    now += 1;
    expect(await auth.getAccessToken('owner')).toBe('renewed-token');
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it.each([{ expiresIn: 120 }, { expires_in: 120 }, { expiresIn: 600, expires_in: 120 }])(
    'respects a shorter lifetime %p', async metadata => {
      http.post.mockReturnValueOnce(ok({ token: 'first-token', ...metadata }))
        .mockReturnValueOnce(ok({ token: 'renewed-token' }));
      await auth.getAccessToken('owner');
      now += 59_999;
      expect(await auth.getAccessToken('owner')).toBe('first-token');
      now += 1;
      expect(await auth.getAccessToken('owner')).toBe('renewed-token');
    },
  );

  it('counts token request latency against its usable lifetime', async () => {
    http.post.mockImplementationOnce(() => {
      now += 30_000;
      return ok({ token: 'first-token' });
    }).mockReturnValueOnce(ok({ token: 'renewed-token' }));
    await auth.getAccessToken('owner');
    now += 8 * 60_000 + 30_000;
    expect(await auth.getAccessToken('owner')).toBe('renewed-token');
  });

  it('keeps identities isolated when refreshing an expired token', async () => {
    http.post.mockReturnValueOnce(ok({ token: 'primary-token' }))
      .mockReturnValueOnce(ok({ token: 'spouse-token' }))
      .mockReturnValueOnce(ok({ token: 'new-primary-token' }));
    await auth.getAccessToken('owner_sub');
    now += 5 * 60_000;
    await auth.getAccessToken('owner_sub_spouse');
    now += 4 * 60_000;
    expect(await auth.getAccessToken('owner_sub')).toBe('new-primary-token');
    expect(await auth.getAccessToken('owner_sub_spouse')).toBe('spouse-token');
    expect(http.post).toHaveBeenCalledTimes(3);
  });

  it('propagates renewal failure instead of sending an expired token', async () => {
    const client = new FeezbackHttpClient(http as any, auth);
    http.post.mockReturnValueOnce(ok({ token: 'old-token' })).mockReturnValueOnce(denied(403));
    await auth.getAccessToken('owner');
    now += 11 * 60_000;
    await expect(client.get('/accounts', { sub: 'owner' })).rejects.toMatchObject({ status: 403 });
    expect(http.get).not.toHaveBeenCalled();
    http.post.mockReturnValueOnce(ok({ token: 'new-token' }));
    expect(await auth.getAccessToken('owner')).toBe('new-token');
  });

  it.each(['accounts', 'cards'])('refreshes between pages in a long %s pull', async resource => {
    const client = new FeezbackHttpClient(http as any, auth);
    const consentApi = new FeezbackConsentApiService(client, auth);
    http.post.mockReturnValueOnce(ok({ token: 'first-token' }))
      .mockReturnValueOnce(ok({ token: 'renewed-token' }));
    http.get.mockImplementation((url: string) => {
      const page = Number(new URL(url).searchParams.get('page'));
      if (page < 2) {
        now += 5 * 60_000;
        return ok({ transactions: { booked: Array.from({ length: 1000 }, (_, i) => ({ transactionId: `${page}-${i}` })) } });
      }
      return ok({ transactions: { booked: [{ transactionId: 'last-row' }] } });
    });
    const result = resource === 'cards'
      ? await consentApi.getCardTransactions('owner', 'consent', 'resource')
      : await consentApi.getAccountTransactionsByConsent('owner', 'consent', 'resource');
    expect(result.transactions.booked).toHaveLength(2001);
    expect(http.get.mock.calls.map(([, config]) => config.headers.Authorization))
      .toEqual(['Bearer first-token', 'Bearer first-token', 'Bearer renewed-token']);
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls.map(([url]) => new URL(url).searchParams.get('page'))).toEqual(['0', '1', '2']);
  });

  it('refreshes before retrying when backoff crosses the renewal boundary', async () => {
    const client = new FeezbackHttpClient(http as any, auth);
    http.post.mockReturnValueOnce(ok({ token: 'first-token' }))
      .mockReturnValueOnce(ok({ token: 'renewed-token' }));
    await auth.getAccessToken('owner');
    now += 8 * 60_000;
    (sleep as jest.Mock).mockImplementationOnce(async () => { now += 2 * 60_000; });
    http.get.mockReturnValueOnce(denied(503)).mockReturnValueOnce(ok({ accounts: [] }));
    await expect(client.get('/accounts', { sub: 'owner' })).resolves.toEqual({ accounts: [] });
    expect(http.get.mock.calls.map(([, config]) => config.headers.Authorization))
      .toEqual(['Bearer first-token', 'Bearer renewed-token']);
    expect(http.post).toHaveBeenCalledTimes(2);
  });
});
