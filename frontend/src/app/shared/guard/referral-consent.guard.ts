import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { StartupService } from '../../services/startup.service';

/**
 * Gate on /referral-consent/:code. Per the locked decision, login must
 * happen BEFORE the consent screen, not inline on this page — an
 * unauthenticated visitor is redirected to /login with the referral code
 * preserved as a query param, and LoginPage completes the round trip back
 * to /referral-consent/:code after a successful sign-in (see LoginPage.login()).
 */
@Injectable({ providedIn: 'root' })
export class ReferralConsentGuard implements CanActivate {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly startup = inject(StartupService);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    await this.startup.whenReady();

    if (this.authService.isLoggedIn) {
      return true;
    }

    const code = route.paramMap.get('code');
    return this.router.createUrlTree(['/login'], { queryParams: { ref: code } });
  }
}
