import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { switchMap, take } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from '../services/auth.service';
import { ClientPanelService } from '../services/clients-panel.service';

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
      switchMap(token => {
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