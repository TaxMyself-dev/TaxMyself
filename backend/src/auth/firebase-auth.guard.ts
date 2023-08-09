// import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
// import { Observable } from 'rxjs';
// import { auth } from 'firebase-admin';

// @Injectable()
// export class FirebaseAuthGuard implements CanActivate {
//   canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
//     const request = context.switchToHttp().getRequest();
//     const authToken = this.extractTokenFromRequest(request);

//     return this.verifyFirebaseToken(authToken);
//   }

// //   private extractTokenFromRequest(request: any): string {
// //     // Implement how you extract the token from the request (e.g., from headers, cookies, or query params)
// //     // For example, if you are sending the token in the Authorization header:
// //     const authHeader = request.headers.authorization;
// //     if (authHeader && authHeader.startsWith('Bearer ')) {
// //       return authHeader.split(' ')[1];
// //     }
// //     return null;
// //   }

//   private async verifyFirebaseToken(token: string): Promise<boolean> {
//     if (!token) {
//       return false;
//     }

//     try {
//       // Verify the token with Firebase Admin SDK
//       const decodedToken = await admin.auth().verifyIdToken(token);
//       request.firebaseUser = decodedToken; // You can store the decoded user information in the request for further use
//       return true;
//     } catch (error) {
//       return false;
//     }
//   }
// }
