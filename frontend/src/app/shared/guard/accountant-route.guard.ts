import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { StartupService } from '../../services/startup.service';

/** Keeps regular users out of the accountant client workspace. */
@Injectable({ providedIn: 'root' })
export class AccountantRouteGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly startup: StartupService,
  ) {}

  async canActivate(): Promise<boolean | UrlTree> {
    await this.startup.whenReady();
    let realUser = this.authService.getRealUserDataFromLocalStorage();
    if (!realUser && this.authService.isLoggedIn) {
      try {
        realUser = await firstValueFrom(this.authService.restoreUserData());
      } catch {
        realUser = null;
      }
    }

    const roles = Array.isArray(realUser?.role) ? realUser.role : [realUser?.role];
    if (roles.includes('ACCOUNTANT') || roles.includes('ADMIN')) return true;
    return this.router.createUrlTree(['/my-account']);
  }
}
