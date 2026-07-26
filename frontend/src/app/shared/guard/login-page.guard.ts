import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NetworkStatusService } from '../../services/pwa/network-status.service';
import { RoutePersistenceService } from '../../services/route-persistence.service';
import { StartupService } from '../../services/startup.service';

/**
 * Gate on `/login`. Waits for the startup gate, then either lets the login page
 * render or redirects an already-authenticated user straight into the app.
 *
 * This decision used to live in `LoginPage.ngOnInit`, which meant the login
 * page was instantiated and rendered first and only then redirected — the
 * login flash on an installed-PWA cold start. As a guard, the component is
 * never created for a user who turns out to be signed in, and the router's
 * first NavigationEnd is already the final destination.
 *
 * Mirrors {@link StartupRedirectGuard}'s conditions so the two can't disagree
 * and ping-pong.
 */
@Injectable({ providedIn: 'root' })
export class LoginPageGuard implements CanActivate {
  private readonly startup = inject(StartupService);
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkStatusService);
  private readonly routes = inject(RoutePersistenceService);
  private readonly router = inject(Router);

  async canActivate(): Promise<boolean | UrlTree> {
    // Read the navigation state before awaiting — it is only available while
    // the navigation that triggered this guard is still current.
    const fromRegister =
      (this.router.getCurrentNavigation()?.extras?.state as { from?: string } | undefined)?.from === 'register';

    await this.startup.whenReady();

    // Deliberate arrival straight after registering: show the "verify your
    // email" state instead of bouncing into the app.
    if (fromRegister) {
      return true;
    }

    // Offline: stay on login even if a session was restored — do NOT sign the
    // user out, and do not enter an app that cannot load any data.
    if (!this.network.isBrowserOnline()) {
      return true;
    }
    if (!this.auth.isLoggedIn) {
      return true;
    }
    // Signed in but no cached profile — the login page is the recovery surface.
    if (!this.auth.getUserDataFromLocalStorage()) {
      return true;
    }

    return this.router.parseUrl(this.routes.getPostLoginUrl());
  }
}
