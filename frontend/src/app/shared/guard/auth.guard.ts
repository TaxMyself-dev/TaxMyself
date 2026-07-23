import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
  UrlTree,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { isTransportError } from '../errors/auth-unavailable.error';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard {
  constructor(public authService: AuthService, public router: Router) {}

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean | UrlTree> {
    // Firebase restores the persisted session from IndexedDB asynchronously.
    // Deciding before that finishes is what previously logged users out on a
    // PWA cold start, so always wait for initialization first.
    await this.authService.waitForAuthInit();

    if (!this.authService.isLoggedIn) {
      console.warn('AuthGuard: no restored Firebase session - redirecting to login');
      return this.router.createUrlTree(['/login']);
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
