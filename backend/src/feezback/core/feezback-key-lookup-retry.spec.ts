import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { FeezbackHttpClient } from './feezback-http.client';
import { FeezbackAuthService } from './feezback-auth.service';
import { sleep, calcBackoffMs } from './feezback-retry.utils';

jest.mock('./feezback-retry.utils', () => ({
  ...jest.requireActual('./feezback-retry.utils'),
  sleep: jest.fn().mockResolvedValue(undefined),
  calcBackoffMs: jest.fn().mockReturnValue(25),
}));
const pause = sleep as jest.Mock;
const backoff = calcBackoffMs as jest.Mock;
const errorResponse = (status = 400, data: any = { error: 'Bad Request', error_code: 1004 }) => {
  const error: any = new Error('Provider rejected request');
  error.isAxiosError = true; error.response = { status, data, headers: {} };
  return error;
};
const failed = (status = 400, data?: any) => throwError(() => errorResponse(status, data));
const success = (data: any) => of({ status: 200, data, headers: {}, config: {} });

describe('bounded PUBLIC_KEY_NOT_FOUND mitigation', () => {
  let logs: jest.SpyInstance;
  beforeEach(() => {
    pause.mockClear(); backoff.mockClear();
    logs = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logs.mockRestore());

  describe('FeezbackHttpClient configured token/link POST', () => {
    const base = 'https://provider.test/proxy/feezback';
    let http: any, client: FeezbackHttpClient;
    const body = { token: 'signed-jwt-opaque' };
    beforeEach(() => {
      http = { post: jest.fn(), get: jest.fn(), delete: jest.fn() };
      client = new FeezbackHttpClient(http, { getTppApiUrl: () => base,
        getLgsUrl: () => base + '/link', getTokenUrl: () => base + '/token' } as any);
    });
    it.each(['/link', '/token'])('retries one transient1004 on %s with exactly the same signed body', async path => {
      http.post.mockReturnValueOnce(failed()).mockReturnValueOnce(success({ ok: true }));
      await expect(client.post(path, body)).resolves.toEqual({ ok: true });
      expect(http.post).toHaveBeenCalledTimes(2);
      expect(http.post.mock.calls[0][1]).toBe(body);
      expect(http.post.mock.calls[1][1]).toBe(body);
      expect(pause).toHaveBeenCalledTimes(1); expect(pause).toHaveBeenCalledWith(200);
      expect(backoff).not.toHaveBeenCalled();
      expect(logs).not.toHaveBeenCalled();
    });
    it('propagates a repeated1004 after only two attempts, retaining redacted diagnostics', async () => {
      http.post.mockReturnValue(failed(400, { error: 'Bad Request', error_code: 1004, token: body.token }));
      await expect(client.post('/link', body)).rejects.toMatchObject({ status: 400 });
      expect(http.post).toHaveBeenCalledTimes(2); expect(pause).toHaveBeenCalledTimes(1);
      const output = logs.mock.calls.map(call => call.join(' ')).join(' ');
      expect(output).toContain('1004'); expect(output).not.toContain(body.token);
    });
    it.each([{ error_code: 1005 }, { error_code: '1004' }, { code: 1004 }, { error: 'PUBLIC_KEY_NOT_FOUND' }])('does not broaden other400 response %p', async response => {
      http.post.mockReturnValue(failed(400, response));
      await expect(client.post('/link', body)).rejects.toMatchObject({ status: 400 });
      expect(http.post).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled();
    });
    it.each(['/tpp/v1/users/u/consents', '/another/link', 'https://other.test/proxy/feezback/link', '/link?different=1'])('does not retry1004 outside configured LGS endpoint %s', async path => {
      http.post.mockReturnValue(failed());
      await expect(client.post(path, body)).rejects.toMatchObject({ status: 400 });
      expect(http.post).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled();
    });
    it.each(['get', 'delete'])('does not add retries to %s even on a token URL', async method => {
      http[method].mockReturnValue(failed());
      await expect(client[method]('/token')).rejects.toMatchObject({ status: 400 });
      expect(http[method]).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled();
    });
    it('does not retry non400 authentication failure even when payload has1004', async () => {
      http.post.mockReturnValue(failed(401));
      await expect(client.post('/link', body)).rejects.toMatchObject({ status: 401 });
      expect(http.post).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled();
    });
    it('uses the existing overall attempt budget for mixed transient transport and key failures', async () => {
      http.post.mockReturnValueOnce(failed(503, {})).mockReturnValueOnce(failed()).mockReturnValueOnce(success({ ok: true }));
      await expect(client.post('/link', body)).resolves.toEqual({ ok: true });
      expect(http.post).toHaveBeenCalledTimes(3);
      expect(pause.mock.calls).toEqual([[25], [200]]);
      for (const call of http.post.mock.calls) expect(call[1]).toBe(body);
    });
    it('never stacks another key retry beyond the existing total budget', async () => {
      http.post.mockReturnValueOnce(failed()).mockReturnValueOnce(failed(503, {})).mockReturnValue(failed());
      await expect(client.post('/link', body)).rejects.toMatchObject({ status: 400 });
      expect(http.post).toHaveBeenCalledTimes(3);
      expect(pause.mock.calls).toEqual([[200], [25]]);
    });
  });

  describe('FeezbackAuthService separate token path', () => {
    let http: any, jwt: any, auth: FeezbackAuthService;
    beforeEach(() => {
      http = { post: jest.fn() };
      jwt = { generateAccessToken: jest.fn().mockReturnValue('same-signed-jwt') };
      auth = new FeezbackAuthService(http, jwt);
    });
    it('reuses one signed JWT and body on transient1004, then caches the successful token', async () => {
      http.post.mockReturnValueOnce(failed()).mockReturnValueOnce(success({ token: 'access-token', expiresIn: 3600 }));
      await expect(auth.getAccessToken('subject')).resolves.toBe('access-token');
      await expect(auth.getAccessToken('subject')).resolves.toBe('access-token');
      expect(http.post).toHaveBeenCalledTimes(2); expect(jwt.generateAccessToken).toHaveBeenCalledTimes(1);
      expect(http.post.mock.calls[0][1]).toBe(http.post.mock.calls[1][1]);
      expect(http.post.mock.calls[1][1]).toEqual({ token: 'same-signed-jwt' });
      expect(pause.mock.calls).toEqual([[200]]);
    });
    it('fails after two identical requests and never caches a failed1004 response', async () => {
      http.post.mockReturnValue(failed(400, { error_code: 1004, token: 'same-signed-jwt' }));
      await expect(auth.getAccessToken('private-subject')).rejects.toMatchObject({ status: 400 });
      expect(http.post).toHaveBeenCalledTimes(2); expect(jwt.generateAccessToken).toHaveBeenCalledTimes(1);
      expect((auth as any).tokenCache.size).toBe(0); expect(pause.mock.calls).toEqual([[200]]);
      const output = logs.mock.calls.map(call => call.join(' ')).join(' ');
      expect(output).toContain('1004'); expect(output).not.toContain('same-signed-jwt'); expect(output).not.toContain('private-subject');
    });
    it.each([{ error_code: 1005 }, { error_code: '1004' }, { error: 'PUBLIC_KEY_NOT_FOUND' }])('does not retry other400 token responses %p', async response => {
      http.post.mockReturnValue(failed(400, response));
      await expect(auth.getAccessToken('subject')).rejects.toMatchObject({ status: 400 });
      expect(http.post).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled();
    });
    it('does not change the separate auth path general503 policy', async () => {
      http.post.mockReturnValue(failed(503));
      await expect(auth.getAccessToken('subject')).rejects.toMatchObject({ status: 503 });
      expect(http.post).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled();
    });
    it('does not cache or retry malformed successful token responses', async () => {
      http.post.mockReturnValue(success({ token: '' }));
      await expect(auth.getAccessToken('subject')).rejects.toThrow('Invalid Feezback access token response');
      expect(http.post).toHaveBeenCalledTimes(1); expect((auth as any).tokenCache.size).toBe(0);
      expect(pause).not.toHaveBeenCalled();
    });
  });
});
