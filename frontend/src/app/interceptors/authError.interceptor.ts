import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';

// Public routes where an unauthenticated 401 is expected and must not force
// a redirect to /login (the user is already on/headed to a public page).
const PUBLIC_ROUTES = ['/login', '/register'];

@Injectable()
export class AuthErrorInterceptor implements HttpInterceptor {

  constructor(
    private afAuth: AngularFireAuth,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    return next.handle(req).pipe(
      catchError(err => {
        if (err.status === 401) {
          return from(this.afAuth.currentUser).pipe(
            switchMap(user => {

              // 🔴 אין משתמש באמת → logout
              if (!user && !PUBLIC_ROUTES.includes(this.router.url)) {
                this.afAuth.signOut();
                this.router.navigate(['/login']);
              }

              // יש משתמש → כנראה טוקן פג, Firebase יטפל בזה
              return throwError(() => err);
            })
          );
        }

        return throwError(() => err);
      })
    );
  }
}
