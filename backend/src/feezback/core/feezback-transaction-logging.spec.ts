import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { FeezbackHttpClient } from './feezback-http.client';
import { feezbackDiagnosticContext } from './feezback-diagnostic-context';

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
  it('logs each failed DELETE retry without changing the retry budget',async()=>{
    http.delete=jest.fn().mockReturnValueOnce(failed(503)).mockReturnValueOnce(failed(503))
      .mockReturnValueOnce(of({status:204,data:null}));
    await expect(client.delete('/tpp/v1/users/owner-sub@tpp/consents/c',{sub:'owner-sub'})).resolves.toBeNull();
    expect(http.delete).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.map(([value])=>JSON.parse(value.slice('[FeezbackResponse] '.length)).attempt)).toEqual([1,2]);
  });
  it('logs sanitized DELETE failures with provider status and attempt timing',async()=>{
    http.delete=jest.fn().mockReturnValue(failed(403));
    await expect(client.delete('/tpp/v1/users/owner-sub@tpp/consents/c',{sub:'owner-sub'})).rejects.toMatchObject({status:403});
    expect(http.delete).toHaveBeenCalledTimes(1);expect(log).toHaveBeenCalledTimes(1);
    const output=String(log.mock.calls[0][0]);
    expect(JSON.parse(output.slice('[FeezbackResponse] '.length))).toMatchObject({method:'DELETE',status:403,attempt:1,responseBody:{error_code:4031}});
    for(const secret of ['opaque-access-token','owner-sub','private-id','never-serialize-config'])expect(output).not.toContain(secret);
  });
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
  it.each(['', '/consents/c'])('logs card-list 403 and redacts encrypted tokens for scope %s', async scope => {
    const token = 'eyJhbGciOiJSU0EtT0FFUC0yNTYi.encrypted-key.iv.ciphertext.tag';
    client = new FeezbackHttpClient(http, {
      getTppApiUrl: () => 'https://provider.test/proxy',
      getAuthHeaders: async () => ({ Authorization: 'Bearer ' + token }),
    } as any);
    http.get.mockReturnValue(throwError(() => ({
      isAxiosError: true, code: 'ERR_BAD_REQUEST', message: 'Denied Bearer ' + token,
      config: { secret: 'never-serialize-config' },
      response: { status: 403, headers: {}, data: {
        error_code: 4031, description: 'Card access denied', token,
        nested: { authorization: 'Bearer ' + token }, detail: 'echo ' + token + ' owner-sub',
      } },
    })));
    await expect(client.get('/tpp/v1/users/owner-sub@tpp' + scope + '/cards',
      { sub: 'owner-sub', params: { preventUpdate: true, withInvalid: false, withBalances: true } }))
      .rejects.toMatchObject({ status: 403 });
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get.mock.calls[0][1].params).toEqual({ preventUpdate: true, withInvalid: false, withBalances: true });
    expect(log).toHaveBeenCalledTimes(1);
    const output = log.mock.calls[0][0];
    const data = JSON.parse(output.slice('[FeezbackResponse] '.length));
    expect(data).toMatchObject({ status: 403, attempt: 1,
      responseBody: { error_code: 4031, description: 'Card access denied', token: '<REDACTED>' } });
    for (const secret of [token, 'owner-sub', 'never-serialize-config']) expect(output).not.toContain(secret);
  });
  it('does not log successful card lists', async () => {
    http.get.mockReturnValue(of({ status: 200, data: { cards: [] } }));
    await expect(client.get('/tpp/v1/users/owner/cards')).resolves.toEqual({ cards: [] });
    expect(log).not.toHaveBeenCalled();
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
    await expect(client.get('/unrelated')).rejects.toMatchObject({ status: 403 });
    expect(log).not.toHaveBeenCalled();
  });
});

describe('account and consent discovery response diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each(['accounts', 'consents'])('logs the actual %s 401 provider body with safe correlation IDs', async endpoint => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const body = { error: { code: 'INSUFFICIENT_CONSENT', message: 'Missing ACCOUNTS basket' },
      iban: 'private-iban', maskedPan: 'private-pan', authorization: 'opaque-secret' };
    const http: any = { get: jest.fn().mockReturnValue(throwError(() => ({ isAxiosError: true,
      message: 'Denied', code: 'ERR_BAD_REQUEST', response: { status: 401, data: body } }))) };
    const client = new FeezbackHttpClient(http, { getTppApiUrl: () => 'https://provider.test',
      getAuthHeaders: async () => ({ Authorization: 'Bearer opaque-secret' }) } as any);
    await expect(feezbackDiagnosticContext.run({ syncRunId: 'run-safe', connectionRole: 'spouse',
      sourceRecordId: 42, operation: 'bank_retry' }, () => client.get('/tpp/v1/users/owner-sub@tpp/' + endpoint,
      { sub: 'owner-sub' }))).rejects.toMatchObject({ status: 401, responseBody: body });
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    const output = String(log.mock.calls[0][0]);
    expect(JSON.parse(output.slice('[FeezbackResponse] '.length))).toMatchObject({ status: 401,
      providerCode: 'INSUFFICIENT_CONSENT', syncRunId: 'run-safe', connectionRole: 'spouse', sourceRecordId: 42,
      responseBody: { error: { code: 'INSUFFICIENT_CONSENT', message: 'Missing ACCOUNTS basket' } } });
    for (const secret of ['private-iban', 'private-pan', 'opaque-secret', 'owner-sub']) expect(output).not.toContain(secret);
  });
});
