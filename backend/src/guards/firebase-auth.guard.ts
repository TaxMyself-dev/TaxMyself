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

    //console.log("🔥 FirebaseAuthGuard triggered");

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>(); // ✅ Use the custom request type

    //console.log("👉 Headers received:", request.headers);

    // ✅ Extract the token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No valid authorization token provided');
    }

    //console.log("🔐 Authorization header:", authHeader);

    const token = authHeader.split(' ')[1]; // ✅ Extract only the token part

    // ✅ Validate the accountant's token and get Firebase UID
    const decodedToken = await this.validateToken(token);
    const authenticatedFirebaseId = decodedToken.uid;
    const businessNumberHeader = (request.headers['businessnumber'] as string | undefined);

    // ✅ Attach the authenticated user (agent) info
    request.user = { firebaseId: authenticatedFirebaseId, role: 'user', businessNumber: businessNumberHeader, }; // ✅ Now TypeScript recognizes `request.user`


    //TODO: If this agent need to update the business number to client, not of agent.
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