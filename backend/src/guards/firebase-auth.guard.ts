import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Observable } from 'rxjs';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    let token = request.body.token;

    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    return this.validateToken(token);
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      await admin.auth().verifyIdToken(token);
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid authorization token');
    }
  }
}