## Purpose

Backend authentication and role/access guards shared by protected controllers.

## Key entities/files

- `firebase-auth.guard.ts` verifies Firebase identity and attaches authenticated
  request context. When `AUTH_MFA_REQUIRED=true`, it also rejects every
  protected request whose verified Firebase ID token does not contain
  `firebase.sign_in_second_factor`; the stable response code is
  `MFA_REQUIRED`. Keep the flag false until TOTP is enabled and tested in the
  matching Firebase/Identity Platform project.
- `admin.guard.ts` runs after `FirebaseAuthGuard`, authorizes the verified real
  actor (`actorFirebaseId`, falling back to `firebaseId`), and rejects
  non-admin requests before interceptors or controller handlers execute.
- Other guards restrict subscription and role-specific endpoints.

## Main flows

- Treat client-supplied user/business identifiers as untrusted; authorization
  must derive from verified request identity and server-side relationships.
- Never weaken a guard to solve a frontend navigation problem. Authentication,
  authorization or delegation-scope changes require explicit approval.
- MFA enforcement is server-authoritative. Frontend routing improves the
  enrollment/challenge experience but must never be the only MFA boundary.
- Legacy operational/provider triggers shown inside the admin panel must use
  both `FirebaseAuthGuard` and `AdminGuard`; a hidden menu or frontend guard is
  never sufficient authorization.
- Authentication, MFA and delegation denials emit bounded `security_event`
  logs for Cloud Monitoring. These records may contain only the event name,
  HTTP method, query-free path and required scope; never log bearer tokens,
  Firebase IDs, business identifiers, headers or request bodies.

## Related topics

- `backend/src/users/AGENTS.md`
- `backend/src/delegation/AGENTS.md`
- `frontend/src/app/shared/guard/AGENTS.md`
