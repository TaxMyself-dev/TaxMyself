import { AuthGuard } from './auth.guard';
import { environment } from '../../../environments/environment';

describe('AuthGuard MFA enforcement', () => {
  const originalRequireMfa = environment.requireMfa;
  let createdUrl: string | undefined;
  let authService: any;
  let mfa: any;
  let guard: AuthGuard;

  beforeEach(() => {
    environment.requireMfa = true;
    createdUrl = undefined;
    authService = {
      isLoggedIn: true,
      getUserDataFromLocalStorage: () => ({ firebaseId: 'owner-uid' }),
    };
    mfa = { sessionState: () => Promise.resolve('VERIFIED') };
    guard = new AuthGuard(
      authService,
      {
        createUrlTree: ([url]: string[]) => {
          createdUrl = url;
          return url;
        },
      } as any,
      { whenReady: () => Promise.resolve() } as any,
      mfa,
    );
  });

  afterAll(() => {
    environment.requireMfa = originalRequireMfa;
  });

  it('routes an unenrolled authenticated user to MFA setup', async () => {
    mfa.sessionState = () => Promise.resolve('NOT_ENROLLED');

    const result = await guard.canActivate({} as any, {} as any);

    expect(result as any).toBe('/mfa/setup');
    expect(createdUrl).toBe('/mfa/setup');
  });

  it('routes a session without second-factor proof to login', async () => {
    mfa.sessionState = () => Promise.resolve('VERIFICATION_REQUIRED');

    const result = await guard.canActivate({} as any, {} as any);

    expect(result as any).toBe('/login');
    expect(createdUrl).toBe('/login');
  });

  it('allows a verified MFA session with a cached profile', async () => {
    const result = await guard.canActivate({} as any, {} as any);

    expect(result).toBeTrue();
    expect(createdUrl).toBeUndefined();
  });
});
