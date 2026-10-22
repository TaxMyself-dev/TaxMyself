import { FeezbackHttpError } from '../core/feezback-errors';
import { of } from 'rxjs';
import { FeezbackApiService } from './feezback-api.service';
import { FeezbackHttpClient } from '../core/feezback-http.client';

describe('Feezback consent termination transport', () => {
  it('sends authenticated DELETE with encoded ownership and the documented query reason', async () => {
    const http: any = { delete: jest.fn().mockReturnValue(of({ status: 204, data: undefined })) };
    const auth: any = { getAccessToken: jest.fn().mockResolvedValue('secret'), getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer secret' }), getTppApiUrl: () => 'https://provider.test', getTppId: () => 'tpp' };
    const client = new FeezbackHttpClient(http, auth);
    const api = new FeezbackApiService(client, auth, {} as any);
    await api.terminateConsent('owner_sub', 'consent/id');
    expect(http.delete).toHaveBeenCalledWith('https://provider.test/tpp/v1/users/owner_sub%40tpp/consents/consent%2Fid', expect.objectContaining({
      params: { reason: 'clientDisconnectedFromDigital' }, headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }));
  });
  it('asks for invalid permissions too and refuses malformed authoritative lists', async () => {
    const http: any = { get: jest.fn().mockResolvedValue({ consents: [] }) };
    const auth: any = { getAccessToken: jest.fn().mockResolvedValue('secret'), getTppId: () => 'tpp' };
    const api = new FeezbackApiService(http, auth, {} as any);
    await expect(api.getUserConsents('owner_sub', true)).resolves.toEqual({ consents: [] });
    expect(http.get).toHaveBeenCalledWith('/tpp/v1/users/owner_sub@tpp/consents?withInvalid=true', expect.anything());
    http.get.mockResolvedValue({ unexpected: true });
    await expect(api.getUserConsents('owner_sub', true)).rejects.toThrow('Invalid Feezback consent response');
  });
  it('does not normalize a malformed cards body into authoritative empty data', async () => {
    const api = new FeezbackApiService({ get: jest.fn().mockResolvedValue({ unexpected: true }) } as any,
      { getAccessToken: jest.fn(), getTppId: () => 'tpp' } as any, {} as any);
    await expect(api.getUserCards('owner_sub', { strictResponse: true })).rejects.toThrow('Invalid Feezback cards response');
  });

  it('accepts only an attributed owned consent-list GET 404 as absent registration', async () => {
    const error = new FeezbackHttpError({ method: 'GET', url: 'https://provider.test/tpp/v1/users/owner_sub%40tpp/consents?withInvalid=true', status: 404, message: 'userNotFound' });
    const api = new FeezbackApiService({ get: jest.fn().mockRejectedValue(error) } as any,
      { getAccessToken: jest.fn(), getTppId: () => 'tpp' } as any, {} as any);
    await expect(api.getUserConsents('owner_sub', true)).resolves.toEqual({ consents: [] });
    await expect(api.getUserConsents('owner_sub')).rejects.toBe(error);
  });
  it.each([
    ['POST', 'https://provider.test/token'],
    ['GET', 'https://provider.test/token'],
    ['GET', 'https://provider.test/tpp/v1/users/other_sub@tpp/consents'],
    ['GET', 'https://provider.test/tpp/v1/users/owner_sub@wrong-tpp/consents'],
  ])('preserves %s %s 404 as uncertainty', async (method, url) => {
    const error = new FeezbackHttpError({ method, url, status: 404, message: 'not found' });
    const api = new FeezbackApiService({ get: jest.fn().mockRejectedValue(error) } as any,
      { getAccessToken: jest.fn(), getTppId: () => 'tpp' } as any, {} as any);
    await expect(api.getUserConsents('owner_sub', true)).rejects.toBe(error);
  });
  it('preserves access-token acquisition 404 without reaching the consent endpoint', async () => {
    const error = new FeezbackHttpError({ method: 'POST', url: 'https://provider.test/token', status: 404, message: 'token route missing' });
    const http: any = { get: jest.fn() };
    const api = new FeezbackApiService(http,
      { getAccessToken: jest.fn().mockRejectedValue(error), getTppId: () => 'tpp' } as any, {} as any);
    await expect(api.getUserConsents('owner_sub', true)).rejects.toBe(error);
    expect(http.get).not.toHaveBeenCalled();
  });

});
