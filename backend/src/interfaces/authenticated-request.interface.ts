import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    firebaseId: string; // The effective user's Firebase ID (the client when impersonating)
    role: 'user' | 'agent';
    businessNumber?: string;
    actorFirebaseId?: string; // The authenticated caller's own Firebase ID — preserved through impersonation
    delegationScopes?: string[]; // Scopes of the delegation used for impersonation (empty when not delegated)
  };
}
