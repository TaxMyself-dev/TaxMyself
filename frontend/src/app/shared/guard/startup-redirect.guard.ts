import { Injectable, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NetworkStatusService } from '../../services/pwa/network-status.service';
import { StartupService } from '../../services/startup.service';
import { DEFAULT_AUTHENTICATED_PATH } from '../auth/default-authenticated-route';
import { MfaService } from '../../services/mfa.service';
import { environment } from '../../../environments/environment';

/**
 * Root `''` route decision: wait for Firebase auth init, then return a UrlTree
 * for either the default authenticated page (online + authenticated) or
 * `/login`. The previously visited route is deliberately not restored.
 *
 * Never returns `true` — the empty path has no component; this guard is the
 * single authoritative cold-start redirect.
 */
@Injectable({ providedIn: 'root' })
export class StartupRedirectGuard implements CanActivate {
  private readonly startup = inject(StartupService);
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkStatusService);
  private readonly router = inject(Router);
  private readonly mfa = inject(MfaService);

  async canActivate(
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot,
  ): Promise<UrlTree> {
    await this.startup.whenReady();

    // Offline cold start always lands on login — even if Firebase restored a
    // session from sessionStorage. Do NOT sign them out.
    if (!this.network.isBrowserOnline()) {
      return this.router.createUrlTree(['/login']);
    }

    if (!this.auth.isLoggedIn) {
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

    // AuthGuard-equivalent profile gate: signed-in-but-no-userData must not
    // enter the app (would ping-pong with AuthGuard → /login).
    if (!this.auth.getUserDataFromLocalStorage()) {
      return this.router.createUrlTree(['/login']);
    }

    return this.router.createUrlTree([DEFAULT_AUTHENTICATED_PATH]);
  }
}
