import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { StartupService } from '../../services/startup.service';

/**
 * UI boundary for the internal admin console.
 *
 * Backend AdminGuard remains authoritative. This guard prevents a regular
 * authenticated user from rendering the admin shell or its static content.
 */
@Injectable({ providedIn: 'root' })
export class AdminRouteGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly startup: StartupService,
  ) {}

  async canActivate(): Promise<boolean | UrlTree> {
    // Angular may start guards in the same route concurrently. Do not assume
    // AuthGuard has already restored the profile on a cold application boot.
    await this.startup.whenReady();
    let realUser = this.authService.getRealUserDataFromLocalStorage();
    if (!realUser && this.authService.isLoggedIn) {
      try {
        realUser = await firstValueFrom(this.authService.restoreUserData());
      } catch {
        realUser = null;
      }
    }
    if (realUser?.role?.includes('ADMIN')) {
      return true;
    }
    return this.router.createUrlTree(['/my-account']);
  }
}
