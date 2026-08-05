import { Injectable, Injector } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpResponse } from '@angular/common/http';
import { from, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { isTransportError } from '../shared/errors/auth-unavailable.error';
import { NetworkStatusService } from '../services/pwa/network-status.service';

// Public routes where an unauthenticated 401 is expected and must not force
// a redirect to /login (the user is already on/headed to a public page).
const PUBLIC_ROUTES = ['/login', '/register'];

@Injectable()
export class AuthErrorInterceptor implements HttpInterceptor {

  constructor(
    private afAuth: AngularFireAuth,
    private router: Router,
    // Lazily resolved to avoid a DI cycle: AuthService depends on HttpClient,
    // which builds this interceptor.
    private injector: Injector,
    private network: NetworkStatusService,
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    return next.handle(req).pipe(
      // Feed connectivity hints from real traffic. A response of any status
      // proves we reached the server; the failure path only *hints* offline and
      // NetworkStatusService cross-checks navigator.onLine before believing it.
      tap(event => {
        if (event instanceof HttpResponse) {
          this.network.reportRequestSuccess();
        }
      }),
      catchError(err => {
        // A request that never reached the server carries no verdict about the
        // session — offline, DNS/CORS failure, or an ID token we could not
        // obtain in time. Logging out here would destroy a valid session just
        // because the device lost connectivity.
        if (isTransportError(err)) {
          this.network.reportRequestFailure();
          return throwError(() => err);
        }

        // A real HTTP status means the server answered — we are online.
        if (typeof err?.status === 'number' && err.status > 0) {
          this.network.reportRequestSuccess();
        }

        if (err.status === 401) {
          return from(this.afAuth.currentUser).pipe(
            switchMap(user => {

              // 🔴 אין משתמש באמת → logout (single entry point)
              if (!user && !PUBLIC_ROUTES.includes(this.router.url)) {
                this.injector.get(AuthService).logout();
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
