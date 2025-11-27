import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private afAuth: AngularFireAuth) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    
    // 🔹 DEBUG: Print the URL of the outgoing request
    // console.log("➡️ Intercepting request:", req.url);

    return from(this.afAuth.currentUser).pipe(
      switchMap(user => {
        
        if (!user) {
          // 🔹 DEBUG: No logged-in user
          console.log("❌ No Firebase user -> sending request without token");
          return next.handle(req);
        }

        // 🔹 DEBUG: Firebase user exists
        // console.log("👤 Firebase user detected:", user.uid);

        return from(user.getIdToken()).pipe(
          switchMap(token => {
            // 🔹 DEBUG: Print the token here
            // console.log("🔑 Firebase ID Token:", token);

            const authReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${token}`
              }
            });

            // 🔹 DEBUG: Print final request headers
            // console.log("📨 Final headers:", authReq.headers);

            return next.handle(authReq);
          })
        );
      })
    );
  }
}