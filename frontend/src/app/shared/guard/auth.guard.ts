import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
  UrlTree,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { StartupService } from '../../services/startup.service';
import { isTransportError } from '../errors/auth-unavailable.error';
import { MfaService } from '../../services/mfa.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard {
  constructor(
    public authService: AuthService,
    public router: Router,
    private startup: StartupService,
    private mfa: MfaService,
  ) {}

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean | UrlTree> {
    // Firebase restores the persisted session asynchronously. Deciding before
    // that finishes is what previously logged users out on a PWA cold start, so
    // always wait for the startup gate (runtime mode + persistence + initial
    // auth state) before any redirect decision.
    await this.startup.whenReady();

    if (!this.authService.isLoggedIn) {
      console.warn('AuthGuard: no restored Firebase session - redirecting to login');
      return this.router.createUrlTree(['/login']);
    }

    if (environment.requireMfa) {
      const mfaState = await this.mfa.sessionState();
      if (mfaState === 'NOT_ENROLLED') {
        return this.router.createUrlTree(['/mfa/setup']);
      }
      if (mfaState !== 'VERIFIED') {
        return this.router.createUrlTree(['/login']);
      }
    }

    const userData = this.authService.getUserDataFromLocalStorage();
    if (userData) {
      return true;
    }

    // Signed in, but the cached profile is missing (e.g. storage cleared).
    // Try to restore it from the backend.
    console.log('⚠️ userData is null but user is logged in - attempting to restore from backend');
    try {
      const restored = await firstValueFrom(this.authService.restoreUserData());
      if (restored) {
        console.log('✅ userData restored successfully');
        return true;
      }
      console.warn('❌ Failed to restore userData - redirecting to login');
    } catch (error) {
      if (isTransportError(error)) {
        // Offline / token unavailable. The Firebase session is still valid, so
        // do NOT sign the user out. We cannot render a profile-dependent page
        // without userData, so route to /login — which will not bounce back
        // (LoginPage auto-redirects only when cached userData exists), so no
        // redirect loop, and the user gets straight back in once online.
        console.warn('AuthGuard: cannot restore userData while offline - staying signed in, routing to login');
        return this.router.createUrlTree(['/login']);
      }
      console.error('❌ Error restoring userData:', error);
    }

    return this.router.createUrlTree(['/login']);
  }
}
