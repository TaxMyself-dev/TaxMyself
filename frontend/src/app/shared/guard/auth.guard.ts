import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Observable, of, switchMap, map, catchError } from 'rxjs';
@Injectable({
  providedIn: 'root',
})
export class AuthGuard {
  constructor(public authService: AuthService, public router: Router) {}
  
  // canActivate(
  //   next: ActivatedRouteSnapshot,
  //   state: RouterStateSnapshot
  // ): Observable<boolean> | Promise<boolean> | UrlTree | boolean {
  //   console.log("can active");
    
  //   if (this.authService.isLoggedIn !== true) {
  //     this.router.navigate(['login']);
  //   }
  //   return true;
  // }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | UrlTree | boolean {
    console.log("can active");
    
    const isLoggedIn = this.authService.isLoggedIn;
    let userData = this.authService.getUserDataFromLocalStorage();
    
    // If user is logged in but userData is missing, try to restore it from backend
    if (isLoggedIn && !userData) {
      console.log('⚠️ userData is null but user is logged in - attempting to restore from backend');
      return this.authService.restoreUserData().pipe(
        map((restoredUserData) => {
          if (restoredUserData) {
            console.log('✅ userData restored successfully');
            return true;
          } else {
            console.warn('❌ Failed to restore userData - redirecting to login');
            this.router.navigate(['login']);
            return false;
          }
        }),
        catchError((error) => {
          console.error('❌ Error restoring userData:', error);
          this.router.navigate(['login']);
          return of(false);
        })
      );
    }
    
    // If user is not logged in or userData is still missing after restoration attempt
    if (!isLoggedIn || !userData) {
      console.warn('AuthGuard: isLoggedIn or userData missing - redirecting to login');
      this.router.navigate(['login']);
      return false;
    }
    
    return true;
  }

}
