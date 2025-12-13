import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
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
              if (!user) {
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
