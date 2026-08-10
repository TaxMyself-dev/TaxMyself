import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    firebaseId: string; // The effective user's Firebase ID (the client when impersonating)
    role: 'user' | 'agent';
    businessNumber?: string;
    actorFirebaseId?: string; // The authenticated caller's own Firebase ID — preserved through impersonation
    delegationScopes?: string[]; // Scopes of the delegation used for impersonation (empty when not delegated)
  };
  /**
   * True only when this request was authorized via an ACTIVE Delegation row
   * (accountant impersonating a client) — never set for the admin-bypass
   * impersonation path or for a client acting on their own data. Drives the
   * EXPENSES/ACCOUNTANT always-open module-access guarantee in
   * SubscriptionAccessService.resolveModulesAccess (see FirebaseAuthGuard).
   */
  isDelegatedAccess?: boolean;
}
