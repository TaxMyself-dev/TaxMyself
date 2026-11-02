import * as jwt from 'jsonwebtoken';
import { FeezbackJwtService } from './feezback-jwt.service';
jest.mock('jsonwebtoken', () => ({ sign: jest.fn().mockReturnValue('signed-test-token') }));

describe('Feezback consent identity JWT', () => {
  let service: FeezbackJwtService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeezbackJwtService({ findOne: jest.fn().mockResolvedValue({ id: 'primary-id', spouseId: 'spouse-id' }) } as any);
    jest.spyOn(service as any, 'getPrivateKey').mockReturnValue('mock-private-key');
  });
  it('preserves the primary SUB and personal identity', async () => {
    await service.generateConsentJwt('owner');
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'owner_sub', flow: expect.objectContaining({
      userIdentifier: { type: 'ID', value: 'primary-id', editable: true }, context: 'owner_context',
    }) }), 'mock-private-key', { algorithm: 'RS512' });
  });
  it('reuses a fixed spouse SUB and pre-fills the spouse identity', async () => {
    await service.generateConsentJwt('owner', true); await service.generateConsentJwt('owner', true);
    expect(jwt.sign).toHaveBeenCalledTimes(2);
    for (const call of (jwt.sign as jest.Mock).mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ sub: 'owner_sub_spouse', flow: expect.objectContaining({
        userIdentifier: { type: 'ID', value: 'spouse-id', editable: true },
      }) }));
    }
  });
});
