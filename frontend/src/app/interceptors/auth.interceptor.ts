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
    console.log("➡️ Intercepting request:", req.url);

    return from(this.afAuth.currentUser).pipe(
      switchMap(user => {
        
        if (!user) {
          // 🔹 DEBUG: No logged-in user
          console.log("❌ No Firebase user -> sending request without token");
          return next.handle(req);
        }

        // 🔹 DEBUG: Firebase user exists
        console.log("👤 Firebase user detected:", user.uid);

        return from(user.getIdToken()).pipe(
          switchMap(token => {
            // 🔹 DEBUG: Print the token here
            console.log("🔑 Firebase ID Token:", token);

            const authReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${token}`
              }
            });

            // 🔹 DEBUG: Print final request headers
            console.log("📨 Final headers:", authReq.headers);

            return next.handle(authReq);
          })
        );
      })
    );
  }
}



// import { Injectable } from '@angular/core';
// import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
// import { from, Observable, switchMap } from 'rxjs';
// import { ClientPanelService } from '../services/clients-panel.service';
// import { AngularFireAuth } from '@angular/fire/compat/auth';

// // @Injectable()
// // export class AuthInterceptor implements HttpInterceptor {
// //   constructor(private clientService: ClientPanelService) {}

// //   intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
// //     let token = localStorage.getItem('token');
// //     let clientUserId = this.clientService.getSelectedClientId();

// //     let headers = req.headers;

// //     //Add Authorization token if available
// //     if (token) {
// //       headers = headers.set('Authorization', `Bearer ${token}`);
// //     }

// //     //Add `x-client-user-id` if acting on behalf of a client
// //     if (clientUserId) {
// //       headers = headers.set('x-client-user-id', clientUserId);
// //     }

// //     //Clone request with updated headers
// //     const modifiedReq = req.clone({ headers });

// //     return next.handle(modifiedReq);
// //   }
// // }

// @Injectable()
// export class AuthInterceptor implements HttpInterceptor {

//   constructor(private afAuth: AngularFireAuth) {}

//   intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

//     return from(this.afAuth.currentUser).pipe(
//       switchMap(user => {
//         if (!user) return next.handle(req);

//         return from(user.getIdToken()).pipe(
//           switchMap(token => {
//             const authReq = req.clone({
//               setHeaders: {
//                 Authorization: `Bearer ${token}`
//               }
//             });
//             return next.handle(authReq);
//           })
//         );
//       })
//     );
//   }
// }

