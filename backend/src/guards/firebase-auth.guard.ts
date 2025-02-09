import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Delegation } from '../delegation/delegation.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';


@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(Delegation)
    private readonly delegationRepository: Repository<Delegation>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>(); // ✅ Use the custom request type

    // ✅ Extract the token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No valid authorization token provided');
    }

    const token = authHeader.split(' ')[1]; // ✅ Extract only the token part

    // ✅ Validate the accountant's token and get Firebase UID
    const decodedToken = await this.validateToken(token);
    const authenticatedFirebaseId = decodedToken.uid;

    // ✅ Attach the authenticated user (agent) info
    request.user = { firebaseId: authenticatedFirebaseId, role: 'user' }; // ✅ Now TypeScript recognizes `request.user`

    // ✅ Extract `x-client-user-id` from headers (if exists)
    const clientUserId = Array.isArray(request.headers['x-client-user-id'])
      ? request.headers['x-client-user-id'][0]
      : request.headers['x-client-user-id'];

    if (!clientUserId) {
      return true; // ✅ If no client ID is provided, it's a regular user request
    }

    // ✅ Check if the authenticated agent has delegation permission for this client
    const hasPermission = await this.delegationRepository.findOne({
      where: { userId: clientUserId, agentId: authenticatedFirebaseId },
    });

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to access this user’s data',
      );
    }

    // ✅ Modify `request.user` to represent the client
    request.user.firebaseId = clientUserId; // ✅ Switch Firebase ID to client
    request.user.role = 'agent'; // ✅ Mark that the request is on behalf of a client
    
    return true;
  }

  private async validateToken(token: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await admin.auth().verifyIdToken(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid authorization token');
    }
  }
}



// @Injectable()
// export class FirebaseAuthGuard implements CanActivate {
//   constructor(
//     @InjectRepository(Delegation)
//     private readonly delegationRepository: Repository<Delegation>,
//   ) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const request = context.switchToHttp().getRequest<Request>();

//     // Extract the token from the Authorization header
//     const authHeader = request.headers.authorization;

    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   throw new UnauthorizedException('No authorization token provided');
    // }

    // console.log("authHeader is ", authHeader);
    
    // const token = authHeader.split(' ')[1]; // Extract token

    // console.log("token is ", token);

    // // Validate the token and get Firebase UID
    // const decodedToken = await this.validateToken(token);
    // const authenticatedFirebaseId = decodedToken.uid;

    // console.log("decodedToken is ", decodedToken);
    // console.log("authenticatedFirebaseId is ", authenticatedFirebaseId);


    // // Check if it's an accountant request (object containing `token` and `userId`)
    // const clientUserId = request.headers['x-client-user-id'][0]; // Get client ID from custom header (if exists)
    // console.log("clientUserId is ", clientUserId);

    // if (!clientUserId) {
    //   // Regular user accessing their own data → Allow access
    //   return true;
    // }

    // // Accountant trying to access a client's data → Check permission
    // const hasPermission = await this.delegationRepository.findOne({
    //   where: { userId: clientUserId, agentId: authenticatedFirebaseId },
    // });

    // if (!hasPermission) {
    //   throw new ForbiddenException(
    //     'You do not have permission to access this user’s data',
    //   );
    // }

  //   return true;
  // }

  // private async validateToken(token: string): Promise<admin.auth.DecodedIdToken> {
  //   try {
  //     return await admin.auth().verifyIdToken(token);
  //   } catch (error) {
  //     throw new UnauthorizedException('Invalid authorization token');
  //   }
  // }
//}



// import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
// import * as admin from 'firebase-admin';
// import { Observable } from 'rxjs';

// @Injectable()
// export class FirebaseAuthGuard implements CanActivate {
//   canActivate(
//     context: ExecutionContext,
//   ): boolean | Promise<boolean> | Observable<boolean> {
//     const request = context.switchToHttp().getRequest();
    
//     let token = request.body.token;

//     if (!token) {
//       throw new UnauthorizedException('No authorization token provided');
//     }

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