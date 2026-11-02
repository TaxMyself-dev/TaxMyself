import { AuthService } from './auth.service';

function createHarness(options: {
  representedUser: Record<string, unknown> | null;
  realRole: string | string[];
}): AuthService {
  const service: any = Object.create(AuthService.prototype);
  service.viewAsUserData = options.representedUser;
  service.getRealUserDataFromLocalStorage = jasmine.createSpy().and.returnValue({
    role: options.realRole,
  });
  return service as AuthService;
}

describe('AuthService demo impersonation policy', () => {
  it('allows a real admin to operate a backend-verified demo profile', () => {
    const service = createHarness({
      representedUser: { email: 'demo@example.test', isDemo: true },
      realRole: ['ADMIN'],
    });

    expect(service.canAdminOperateViewingDemoUser()).toBeTrue();
  });

  it('blocks an admin from operating a real client', () => {
    const service = createHarness({
      representedUser: { email: 'client@example.test', isDemo: false },
      realRole: ['ADMIN'],
    });

    expect(service.canAdminOperateViewingDemoUser()).toBeFalse();
  });

  it('blocks a non-admin from operating a demo profile', () => {
    const service = createHarness({
      representedUser: { email: 'demo@example.test', isDemo: true },
      realRole: ['ACCOUNTANT'],
    });

    expect(service.canAdminOperateViewingDemoUser()).toBeFalse();
  });

  it('does not trust a demo-looking email without the backend isDemo flag', () => {
    const service = createHarness({
      representedUser: {
        email: 'demo+spoof@keepintax.local',
        isDemo: false,
      },
      realRole: ['ADMIN'],
    });

    expect(service.isViewingDemoUser()).toBeFalse();
    expect(service.canAdminOperateViewingDemoUser()).toBeFalse();
  });
});
