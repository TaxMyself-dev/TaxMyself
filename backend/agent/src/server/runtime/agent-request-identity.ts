import { Context } from "effect";

/**
 * The user the Nest backend verified for this request: the Firebase uid of
 * the person acting (the agent's user), and the KeepInTax request context
 * the agent's domain tools may read (the data owner when an accountant
 * acts for a client, the business, the delegation scopes).
 */
export interface AgentRequestUser {
  // The person acting: the agent's conversations, memory and settings are
  // theirs (FirebaseAuthGuard's actorFirebaseId).
  readonly actorFirebaseId: string;
  // The data owner the request acts on (FirebaseAuthGuard's firebaseId):
  // the actor's own uid, or their client's when they act for one.
  readonly firebaseId: string;
  readonly businessNumber: string | null;
  readonly delegationScopes: readonly string[];
  readonly isDelegatedAccess: boolean;
  readonly isAdminImpersonation: boolean;
}

/**
 * The verified user of the request being served (see AgentRequestUser),
 * provided per request by runAppRequest (app-runtime.server.ts).
 */
export class AgentRequestIdentity extends Context.Service<
  AgentRequestIdentity,
  AgentRequestUser
>()("app/server/AgentRequestIdentity") {}
