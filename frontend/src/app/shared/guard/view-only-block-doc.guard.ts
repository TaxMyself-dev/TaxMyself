import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * חוסם כניסה להפקת מסמכים כאשר רואה חשבון צופה בלקוח (צפייה בלבד).
 * Admins and demo presenters are exempt — admins may issue docs on behalf of
 * client users for QA/testing, and demo presenters need to showcase the
 * doc-create flow when demoing the product to new users.
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
      if (!realUserIsAdmin && !this.authService.isViewingDemoUser()) {
        return this.router.createUrlTree(['/my-account']);
      }
    }
    return true;
  }
}
