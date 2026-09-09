## Purpose

Backend authentication and role/access guards shared by protected controllers.

## Key entities/files

- `firebase-auth.guard.ts` verifies Firebase identity and attaches authenticated
  request context.
- `admin.guard.ts` runs after `FirebaseAuthGuard`, authorizes the verified real
  actor (`actorFirebaseId`, falling back to `firebaseId`), and rejects
  non-admin requests before interceptors or controller handlers execute.
- Other guards restrict subscription and role-specific endpoints.

## Main flows

- Treat client-supplied user/business identifiers as untrusted; authorization
  must derive from verified request identity and server-side relationships.
- Never weaken a guard to solve a frontend navigation problem. Authentication,
  authorization or delegation-scope changes require explicit approval.

## Related topics

- `backend/src/users/AGENTS.md`
- `backend/src/delegation/AGENTS.md`
- `frontend/src/app/shared/guard/AGENTS.md`
