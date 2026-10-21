import { ShaamEnvironment } from '../shaam.constants';
import { ShaamConnectionStatus, ShaamProduct } from '../entities/shaam.enums';
import * as encryption from '../utils/shaam-encryption.util';
import { ShaamConnectionService } from './shaam-connection.service';
import { ShaamReauthorizationRequiredError } from './shaam-oauth.service';

jest.mock('../utils/shaam-encryption.util', () => ({
  encryptToken: jest.fn((value: string) => `enc:${value}`),
  decryptToken: jest.fn((value: string) => value.replace('enc:', '')),
}));

describe('ShaamConnectionService', () => {
  function setup(row: any) {
    const repo = { findOne: jest.fn().mockResolvedValue(row), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
    const oauth = { refreshAccessToken: jest.fn().mockResolvedValue({ access_token: 'new', refresh_token: 'new-r', expires_in: 3600 }) };
    return { service: new ShaamConnectionService(repo as any, oauth as any), repo, oauth };
  }

  it('returns a valid token only from the requested product row', async () => {
    const row = { accessToken: 'enc:token', refreshToken: null, status: ShaamConnectionStatus.ACTIVE, expiresAt: new Date(Date.now() + 3600_000) };
    const { service, repo } = setup(row);
    await expect(service.getValidAccessToken(1, ShaamProduct.UNIFORM_FILE, ShaamEnvironment.TSANDBOX)).resolves.toBe('token');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { businessId: 1, product: ShaamProduct.UNIFORM_FILE, environment: ShaamEnvironment.TSANDBOX } });
  });

  it('never refreshes an expired uniform-file Daily Token', async () => {
    const row = { accessToken: 'enc:old', refreshToken: 'enc:r', status: ShaamConnectionStatus.ACTIVE, expiresAt: new Date(Date.now() - 1) };
    const { service, oauth, repo } = setup(row);
    await expect(service.getValidAccessToken(1, ShaamProduct.UNIFORM_FILE, ShaamEnvironment.TSANDBOX)).resolves.toBeNull();
    expect(oauth.refreshAccessToken).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ShaamConnectionStatus.REAUTH_REQUIRED }));
  });

  it('refreshes invoice allocation server-side', async () => {
    const row = { accessToken: 'enc:old', refreshToken: 'enc:r', connectedByFirebaseId: 'actor', status: ShaamConnectionStatus.ACTIVE, expiresAt: new Date(Date.now() - 1) };
    const { service, oauth } = setup(row);
    await expect(service.getValidAccessToken(1, ShaamProduct.INVOICE_ALLOCATION, ShaamEnvironment.TSANDBOX)).resolves.toBe('new');
    expect(oauth.refreshAccessToken).toHaveBeenCalledWith('r');
    expect(encryption.encryptToken).toHaveBeenCalledWith('new');
  });

  it('refreshes an expired invoice token during the connection-status pre-flight', async () => {
    const row = {
      accessToken: 'enc:old',
      refreshToken: 'enc:r',
      connectedByFirebaseId: 'actor',
      status: ShaamConnectionStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 1),
    };
    const { service, oauth } = setup(row);

    const status = await service.status(
      1,
      ShaamProduct.INVOICE_ALLOCATION,
      ShaamEnvironment.TSANDBOX,
    );

    expect(status.connected).toBe(true);
    expect(status.requiresReauthorization).toBe(false);
    expect(status.expiresAt).toBe(row.expiresAt);
    expect(status.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(oauth.refreshAccessToken).toHaveBeenCalledWith('r');
    expect(row.accessToken).toBe('enc:new');
  });

  it('reports reauthorization for an expired connection without a refresh token', async () => {
    const row = {
      accessToken: 'enc:old',
      refreshToken: null,
      connectedByFirebaseId: 'actor',
      status: ShaamConnectionStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 1),
    };
    const { service, oauth, repo } = setup(row);

    await expect(
      service.status(
        1,
        ShaamProduct.INVOICE_ALLOCATION,
        ShaamEnvironment.TSANDBOX,
      ),
    ).resolves.toEqual({
      connected: false,
      expiresAt: row.expiresAt,
      requiresReauthorization: true,
    });

    expect(oauth.refreshAccessToken).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ShaamConnectionStatus.REAUTH_REQUIRED }),
    );
  });

  it('preserves an existing refresh token when a refresh response omits it', async () => {
    const row = {
      accessToken: 'enc:old',
      refreshToken: 'enc:keep-me',
      connectedByFirebaseId: 'actor',
      status: ShaamConnectionStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 1),
    };
    const { service } = setup(row);

    await service.saveToken(
      1,
      'actor',
      ShaamProduct.INVOICE_ALLOCATION,
      ShaamEnvironment.TSANDBOX,
      { access_token: 'new', expires_in: 3600 } as any,
    );

    expect(row.accessToken).toBe('enc:new');
    expect(row.refreshToken).toBe('enc:keep-me');
  });

  it('keeps an active grant and surfaces a transient refresh failure', async () => {
    const row = {
      accessToken: 'enc:old',
      refreshToken: 'enc:r',
      connectedByFirebaseId: 'actor',
      status: ShaamConnectionStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 1),
    };
    const { service, oauth, repo } = setup(row);
    oauth.refreshAccessToken.mockRejectedValueOnce(new Error('temporary outage'));

    await expect(
      service.status(
        1,
        ShaamProduct.INVOICE_ALLOCATION,
        ShaamEnvironment.TSANDBOX,
      ),
    ).rejects.toThrow('temporary outage');

    expect(row.status).toBe(ShaamConnectionStatus.ACTIVE);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('requires authorization again only for an explicitly invalid grant', async () => {
    const row = {
      accessToken: 'enc:old',
      refreshToken: 'enc:r',
      connectedByFirebaseId: 'actor',
      status: ShaamConnectionStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 1),
    };
    const { service, oauth, repo } = setup(row);
    oauth.refreshAccessToken.mockRejectedValueOnce(
      new ShaamReauthorizationRequiredError(),
    );

    await expect(
      service.status(
        1,
        ShaamProduct.INVOICE_ALLOCATION,
        ShaamEnvironment.TSANDBOX,
      ),
    ).resolves.toEqual({
      connected: false,
      expiresAt: row.expiresAt,
      requiresReauthorization: true,
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ShaamConnectionStatus.REAUTH_REQUIRED }),
    );
  });
});
