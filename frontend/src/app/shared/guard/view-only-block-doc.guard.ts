import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * חוסם כניסה להפקת מסמכים כאשר רואה חשבון צופה בלקוח (צפייה בלבד).
 */
@Injectable({ providedIn: 'root' })
export class ViewOnlyBlockDocGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(): boolean | UrlTree {
    if (this.authService.isViewingAsClient()) {
      return this.router.createUrlTree(['/my-account']);
    }
    return true;
  }
}
