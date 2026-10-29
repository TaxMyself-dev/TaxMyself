import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { FeezbackHttpClient } from './feezback-http.client';

jest.mock('./feezback-retry.utils', () => ({
  ...jest.requireActual('./feezback-retry.utils'), sleep: jest.fn().mockResolvedValue(undefined),
}));

describe('transaction failure response logging', () => {
  let log: jest.SpyInstance;
  let http: any;
  let client: FeezbackHttpClient;
  const failed = (status: number) => throwError(() => ({
    isAxiosError: true, code: 'ERR_BAD_REQUEST', message: 'Provider denied request',
    config: { secret: 'never-serialize-config' },
    response: { status, headers: {}, data: {
      error_code: 4031, description: 'Consent not authorized',
      token: 'opaque-access-token', nested: { identity: 'private-id' },
      detail: 'echo opaque-access-token owner-sub',
    } },
  }));
  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    http = { get: jest.fn() };
    client = new FeezbackHttpClient(http, {
      getTppApiUrl: () => 'https://provider.test/proxy',
      getAuthHeaders: async () => ({ Authorization: 'Bearer opaque-access-token' }),
    } as any);
  });
  afterEach(() => log.mockRestore());
  it.each(['accounts', 'cards'])('logs sanitized 403 for %s without retry', async resource => {
    http.get.mockReturnValue(failed(403));
    await expect(client.get(`/tpp/v1/users/owner-sub@tpp/consents/c/${resource}/r/transactions?token=query-secret`,
      { sub: 'owner-sub' })).rejects.toMatchObject({ status: 403 });
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    const output = log.mock.calls[0][0];
    expect(output).toContain('[FeezbackResponse]');
    const data = JSON.parse(output.slice('[FeezbackResponse] '.length));
    expect(data).toMatchObject({ method: 'GET', status: 403, code: 'ERR_BAD_REQUEST',
      attempt: 1, maxAttempts: 3, durationMs: expect.any(Number),
      responseBody: { error_code: 4031, description: 'Consent not authorized' } });
    expect(data.url).toContain(`/${resource}/r/transactions`);
    for (const secret of ['opaque-access-token', 'owner-sub', 'query-secret', 'private-id', 'never-serialize-config']) {
      expect(output).not.toContain(secret);
    }
  });
  it('logs every failed attempt and preserves transient retry behavior', async () => {
    http.get.mockReturnValueOnce(failed(503)).mockReturnValueOnce(failed(503))
      .mockReturnValueOnce(of({ status: 200, data: { transactions: [] } }));
    await expect(client.get('/accounts/r/transactions')).resolves.toEqual({ transactions: [] });
    expect(http.get).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.map(([value]) => JSON.parse(value.slice('[FeezbackResponse] '.length)).attempt)).toEqual([1, 2]);
  });
  it('does not add transaction logs to unrelated reads', async () => {
    http.get.mockReturnValue(failed(403));
    await expect(client.get('/accounts')).rejects.toMatchObject({ status: 403 });
    expect(log).not.toHaveBeenCalled();
  });
});
