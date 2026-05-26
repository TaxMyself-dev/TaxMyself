import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * חוסם כניסה להפקת מסמכים כאשר רואה חשבון צופה בלקוח (צפייה בלבד).
 * Admins are exempt — they may issue docs on behalf of demo/client users
 * for QA/testing while in view-as mode.
 */
@Injectable({ providedIn: 'root' })
export class ViewOnlyBlockDocGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(): boolean | UrlTree {
    if (this.authService.isViewingAsClient()) {
      const realUser = this.authService.getRealUserDataFromLocalStorage();
      const realUserIsAdmin = !!realUser?.role?.includes('ADMIN');
      if (!realUserIsAdmin) {
        return this.router.createUrlTree(['/my-account']);
      }
    }
    return true;
  }
}
