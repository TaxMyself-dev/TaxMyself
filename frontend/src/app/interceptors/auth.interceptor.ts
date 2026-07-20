import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { catchError, switchMap, take, timeout } from 'rxjs/operators';
import { throwError, TimeoutError } from 'rxjs';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from '../services/auth.service';
import { ClientPanelService } from '../services/clients-panel.service';
import { AuthUnavailableError } from '../shared/errors/auth-unavailable.error';

/**
 * How long to wait for Firebase to hand us an ID token before giving up.
 *
 * This bounds *token acquisition only* — never the request itself, so
 * long-running sync/import/upload calls keep an unlimited response time.
 *
 * Offline, the SDK retries a token refresh against securetoken.googleapis.com
 * and `idToken` may not emit for a long time. Without this bound every request
 * hung before `next.handle()` was ever called, which is what stalled the guards
 * and left the router on a blank screen.
 */
const TOKEN_WAIT_MS = 10_000;

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(
    private afAuth: AngularFireAuth,
    private authService: AuthService,
    private clientPanelService: ClientPanelService,
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    return this.afAuth.idToken.pipe(
      take(1),
      timeout(TOKEN_WAIT_MS),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          // Stop here rather than retrying or downgrading to an anonymous
          // request: sending a protected call without a token would come back
          // as a 401 and be indistinguishable from a real credential failure.
          // A typed, status-less error keeps AuthErrorInterceptor from
          // treating this as a rejected session.
          console.warn(`[AuthInterceptor] no ID token within ${TOKEN_WAIT_MS}ms — aborting locally:`, req.url);
          return throwError(() => new AuthUnavailableError(req.url));
        }
        return throwError(() => err);
      }),
      switchMap(token => {
        // Reaching here means Firebase resolved. A null token is a genuine
        // "no session" (public endpoints, login/signup) — unchanged behavior.
        const businessNumber = this.authService.getActiveBusinessNumber();
        const clientId = this.clientPanelService.getSelectedClientId();
        if (!token && !businessNumber && !clientId) {
          return next.handle(req);
        }

        const headers: Record<string, string> = {};
        if (token && !req.headers.has('Authorization')) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        if (businessNumber) {
          headers['businessnumber'] = businessNumber;
        }
        /** כשהרואה חשבון צופה בלקוח – כל הבקשות עם מזהה הלקוח כדי להציג את נתוניו */
        if (clientId) {
          headers['x-client-user-id'] = clientId;
        }

        return next.handle(
          req.clone({
            setHeaders: headers
          })
        );
      })
    );
  }
}
