import { FeezbackController } from './feezback.controller';

describe('Feezback onboarding link', () => {
  let controller: FeezbackController;
  let provider: any;
  let enrollment: any;
  const request: any = { user: { firebaseId: 'owner' } };

  beforeEach(() => {
    provider = {
      refreshUserSources: jest.fn(),
      getUserSyncState: jest.fn().mockResolvedValue(null),
      markConsentInitiated: jest.fn().mockResolvedValue(undefined),
      createConsentLink: jest.fn().mockResolvedValue({ link: 'https://example.test/onboarding' }),
    };
    enrollment = {
      assertCanConnect: jest.fn().mockResolvedValue(undefined),
      options: jest.fn().mockResolvedValue({ enrollment: { status: 'PREPARE' } }),
    };
    controller = new FeezbackController(provider, {} as any, {} as any, {} as any, enrollment);
  });

  it('requires enrollment approval but creates a link without provider discovery', async () => {
    await expect(controller.createConsentLink(request)).resolves.toEqual({ link: 'https://example.test/onboarding' });
    expect(enrollment.assertCanConnect).toHaveBeenCalledWith(expect.objectContaining({ subjectFirebaseId: 'owner' }));
    expect(provider.refreshUserSources).not.toHaveBeenCalled();
    expect(provider.markConsentInitiated).toHaveBeenCalledWith('owner');
    expect(provider.createConsentLink).toHaveBeenCalledWith('owner');
  });

  it('does not send a provider request when the saved-card prerequisite fails', async () => {
    enrollment.assertCanConnect.mockRejectedValue(new Error('Card required'));
    await expect(controller.createConsentLink(request)).rejects.toThrow('Card required');
    expect(provider.markConsentInitiated).not.toHaveBeenCalled();
    expect(provider.createConsentLink).not.toHaveBeenCalled();
  });
});
