import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Observable } from 'rxjs';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    let token = this.getTokenFromBody(request) || this.getTokenFromHeader(request) || this.getTokenFromQuery(request) || this.getTokenFromCookie(request);

    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    return this.validateToken(token);
  }

  getTokenFromBody(request): string | null {
    return request.body && request.body.data || null;
  }

  getTokenFromHeader(request): string | null {
    const authHeader = request.headers.authorization || request.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }
    return null;
  }

  getTokenFromQuery(request): string | null {
    return request.query.token || null;
  }

  getTokenFromCookie(request): string | null {
    return request.cookies.token || null;
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      await admin.auth().verifyIdToken(token);
      console.log("protected data!!!!!!!!!!!!!!!!!!!!!!!!!!");
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid authorization token');
    }
  }
}



// import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
// import { Observable } from 'rxjs';
// import * as admin from 'firebase-admin';
// import { log } from 'console';

// @Injectable()
// export class FirebaseAuthGuard implements CanActivate {
//   canActivate(
//     context: ExecutionContext,
//   ): boolean | Promise<boolean> | Observable<boolean> {
//     const request = context.switchToHttp().getRequest();
//     const token = request.headers.authorization?.split('Bearer ')[1];
    
//     // Log headers to debug
//     console.log('Headers:', request.headers);

//     const authHeader = request.headers.authorization;
    
//     if (!authHeader) {
//         console.log("No authorization header found");
        
//         throw new UnauthorizedException('No authorization header found');
//     }

//     //console.log("request: ", request);
//     console.log("token: ", token);
    

//     if (!token) {
//       console.log("error protected data!!!!!!!!!!!!!!!!!!!!!!!!!!");
//       throw new UnauthorizedException('No authorization token provided');
//     }

//     console.log("protected data!!!!!!!!!!!!!!!!!!!!!!!!!!");
    
//     return this.validateToken(token);
//   }

//   async validateToken(token: string): Promise<boolean> {
//     try {
//       await admin.auth().verifyIdToken(token);
//       return true;
//     } catch (error) {
//       throw new UnauthorizedException('Invalid authorization token');
//     }
//   }
// }
