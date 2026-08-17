import { SetMetadata } from '@nestjs/common';
import { DelegationScope } from 'src/delegation/delegation.entity';

/**
 * Overrides FirebaseAuthGuard's default per-HTTP-verb scope requirement for
 * impersonated (accountant-acting-for-client) requests. Without this
 * decorator the guard falls back to: GET → DOCUMENTS_READ (unrestricted for
 * any ACTIVE delegation, matching historical behavior), POST/PUT/PATCH/
 * DELETE → DOCUMENTS_WRITE. Use this when a route's actual authorization
 * need doesn't match its HTTP verb — e.g. a POST that only reads (loosen to
 * DOCUMENTS_READ) or a write that specifically needs EXPENSES_APPROVE
 * instead of the blanket DOCUMENTS_WRITE.
 */
export const REQUIRED_DELEGATION_SCOPE_KEY = 'requiredDelegationScope';
export const RequiredDelegationScope = (scope: DelegationScope) =>
  SetMetadata(REQUIRED_DELEGATION_SCOPE_KEY, scope);
