/**
 * Unit tests: FirebaseAuthGuard (Phase 0.3 / D12.2, extended for
 * EXPENSES_APPROVE scope support)
 *
 * Covers the impersonation hardening:
 *  - delegation lookup filters status = ACTIVE (REVOKED rows no longer grant access)
 *  - write methods (POST/PUT/PATCH/DELETE) require DOCUMENTS_WRITE scope by
 *    default; NULL-scopes legacy rows are read-only
 *  - GET (and any route with no @RequiredDelegationScope override) requires
 *    only DOCUMENTS_READ, which is never actually gated — any ACTIVE
 *    delegation passes, including NULL/empty scopes
 *  - @RequiredDelegationScope lets a specific route override the per-verb
 *    default (e.g. EXPENSES_APPROVE on approve-* endpoints, or DOCUMENTS_READ
 *    on a POST that's semantically a read)
 *  - actorFirebaseId preserves the caller's own identity through the swap
 *  - admin impersonation is explicitly marked from the verified actor role
 */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as admin from 'firebase-admin';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { DelegationStatus, DelegationScope } from '../delegation/delegation.entity';
import { REQUIRED_DELEGATION_SCOPE_KEY } from '../decorators/required-delegation-scope.decorator';
import { UserRole } from '../enum';

const AGENT = 'agent-firebase-uid';
const CLIENT = 'client-firebase-uid';

describe('FirebaseAuthGuard', () => {
  let delegationRepo: { findOne: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let guard: FirebaseAuthGuard;

  beforeEach(() => {
    delegationRepo = { findOne: jest.fn().mockResolvedValue(null) };
    userRepo = { findOne: jest.fn().mockResolvedValue({ firebaseId: AGENT, role: [UserRole.REGULAR] }) };
    guard = new FirebaseAuthGuard(delegationRepo as any, userRepo as any, new Reflector());
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: AGENT }),
    } as any);
  });

  afterEach(() => jest.restoreAllMocks());

  /** `requiredScope` simulates a route decorated with @RequiredDelegationScope
   *  by stamping the same metadata key the real decorator (SetMetadata)
   *  would attach to the handler function. Omit it to exercise the
   *  per-verb default (no decorator present). */
  function makeContext(method: string, impersonate = true, requiredScope?: DelegationScope) {
    const request: any = {
      method,
      headers: {
        authorization: 'Bearer fake-token',
        businessnumber: '123456789',
        ...(impersonate ? { 'x-client-user-id': CLIENT } : {}),
      },
    };
    const handler = () => undefined;
    if (requiredScope) {
      Reflect.defineMetadata(REQUIRED_DELEGATION_SCOPE_KEY, requiredScope, handler);
    }
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
    };
    return { request, context };
  }

  it('no x-client-user-id → passes, actorFirebaseId = own id, role user', async () => {
    const { request, context } = makeContext('POST', false);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.firebaseId).toBe(AGENT);
    expect(request.user.actorFirebaseId).toBe(AGENT);
    expect(request.user.role).toBe('user');
    expect(delegationRepo.findOne).not.toHaveBeenCalled();
  });

  it('delegation lookup filters status = ACTIVE (revoked → 403)', async () => {
    // repo returns null because the where-clause includes ACTIVE
    const { context } = makeContext('GET');
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(delegationRepo.findOne).toHaveBeenCalledWith({
      where: { userId: CLIENT, agentId: AGENT, status: DelegationStatus.ACTIVE },
    });
  });

  it('ACTIVE read-only + GET → passes, identity swapped, actor preserved', async () => {
    delegationRepo.findOne.mockResolvedValue({ status: DelegationStatus.ACTIVE, scopes: ['DOCUMENTS_READ'] });
    const { request, context } = makeContext('GET');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.firebaseId).toBe(CLIENT);
    expect(request.user.actorFirebaseId).toBe(AGENT);
    expect(request.user.role).toBe('agent');
    expect(request.user.delegationScopes).toEqual(['DOCUMENTS_READ']);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'ACTIVE read-only + %s → 403 view-only',
    async (method) => {
      delegationRepo.findOne.mockResolvedValue({ status: DelegationStatus.ACTIVE, scopes: ['DOCUMENTS_READ'] });
      const { context } = makeContext(method);
      await expect(guard.canActivate(context)).rejects.toThrow('לרואה חשבון הרשאה לצפייה בלבד');
    },
  );

  it('NULL scopes (legacy invite rows) are read-only', async () => {
    delegationRepo.findOne.mockResolvedValue({ status: DelegationStatus.ACTIVE, scopes: null });
    const { context: writeCtx } = makeContext('POST');
    await expect(guard.canActivate(writeCtx)).rejects.toThrow(ForbiddenException);
    const { context: readCtx } = makeContext('GET');
    await expect(guard.canActivate(readCtx)).resolves.toBe(true);
  });

  it('ACTIVE read+write + POST → passes', async () => {
    delegationRepo.findOne.mockResolvedValue({
      status: DelegationStatus.ACTIVE,
      scopes: ['DOCUMENTS_READ', 'DOCUMENTS_WRITE'],
    });
    const { request, context } = makeContext('POST');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.firebaseId).toBe(CLIENT);
    expect(request.user.actorFirebaseId).toBe(AGENT);
  });

  it('admin bypass: no delegation row needed, writes allowed, actor preserved', async () => {
    userRepo.findOne.mockResolvedValue({ firebaseId: AGENT, role: [UserRole.ADMIN] });
    const { request, context } = makeContext('POST');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.firebaseId).toBe(CLIENT);
    expect(request.user.actorFirebaseId).toBe(AGENT);
    expect(request.isAdminImpersonation).toBe(true);
    expect(delegationRepo.findOne).not.toHaveBeenCalled();
  });

  // EXPENSES_APPROVE (fix for accountant blocked from approving expenses on
  // view-only delegation): a dedicated scope, independent of DOCUMENTS_WRITE,
  // that every delegation-creation path now grants automatically — see
  // DelegationScope's doc comment. Applied per-route via
  // @RequiredDelegationScope, which overrides the generic per-verb default.
  describe('EXPENSES_APPROVE scope', () => {
    it('view-only delegation (no DOCUMENTS_WRITE) + EXPENSES_APPROVE present → approve endpoint passes', async () => {
      delegationRepo.findOne.mockResolvedValue({
        status: DelegationStatus.ACTIVE,
        scopes: [DelegationScope.DOCUMENTS_READ, DelegationScope.EXPENSES_APPROVE],
      });
      const { request, context } = makeContext('POST', true, DelegationScope.EXPENSES_APPROVE);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user.firebaseId).toBe(CLIENT);
    });

    it('a pre-migration row missing EXPENSES_APPROVE is blocked from the approve endpoint even with DOCUMENTS_WRITE', async () => {
      delegationRepo.findOne.mockResolvedValue({
        status: DelegationStatus.ACTIVE,
        scopes: [DelegationScope.DOCUMENTS_READ, DelegationScope.DOCUMENTS_WRITE],
      });
      const { context } = makeContext('POST', true, DelegationScope.EXPENSES_APPROVE);
      await expect(guard.canActivate(context)).rejects.toThrow('לרואה חשבון אין הרשאה לאישור הוצאות');
    });

    it('view-only delegation (no DOCUMENTS_WRITE) CAN load a POST route overridden to DOCUMENTS_READ', async () => {
      delegationRepo.findOne.mockResolvedValue({
        status: DelegationStatus.ACTIVE,
        scopes: [DelegationScope.DOCUMENTS_READ],
      });
      const { request, context } = makeContext('POST', true, DelegationScope.DOCUMENTS_READ);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user.firebaseId).toBe(CLIENT);
    });

    it('a POST route overridden to DOCUMENTS_READ passes even with NULL scopes (matches GET default)', async () => {
      delegationRepo.findOne.mockResolvedValue({ status: DelegationStatus.ACTIVE, scopes: null });
      const { context } = makeContext('POST', true, DelegationScope.DOCUMENTS_READ);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('a GET route with no override still requires nothing beyond an ACTIVE delegation (unaffected by the new scope)', async () => {
      delegationRepo.findOne.mockResolvedValue({
        status: DelegationStatus.ACTIVE,
        scopes: [DelegationScope.EXPENSES_APPROVE], // no DOCUMENTS_READ/WRITE at all
      });
      const { context } = makeContext('GET');
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    // The review-workflow sweep (update-doc/update-tx and siblings) is all
    // PATCH/POST — every prior EXPENSES_APPROVE test above exercised POST
    // only, so PATCH was never actually proven through this exact mechanism.
    it('view-only delegation (no DOCUMENTS_WRITE) + EXPENSES_APPROVE present → PATCH route overridden to EXPENSES_APPROVE passes (mirrors update-doc/update-tx)', async () => {
      delegationRepo.findOne.mockResolvedValue({
        status: DelegationStatus.ACTIVE,
        scopes: [DelegationScope.DOCUMENTS_READ, DelegationScope.EXPENSES_APPROVE],
      });
      const { request, context } = makeContext('PATCH', true, DelegationScope.EXPENSES_APPROVE);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user.firebaseId).toBe(CLIENT);
    });
  });

  // Document issuance (POST /documents/create-doc) carries NO
  // @RequiredDelegationScope override and no role==='agent' block in
  // DocumentsController — so it falls through to the generic per-verb
  // default like any other unmarked POST. These tests pin down the ACTUAL
  // current behavior (not the desired one): an accountant impersonating a
  // client with a full DOCUMENTS_WRITE delegation CAN currently issue a
  // document in the client's name, and a view-only/EXPENSES_APPROVE-only
  // delegation cannot. Flagged separately to the product owner — this
  // ticket only confirms/pins the gap, it does not change it (out of scope:
  // "if it currently is scope-gated by DOCUMENTS_WRITE, flag that
  // separately, don't silently change it as part of this fix").
  describe('document issuance route (no override — generic per-verb default, NOT unconditionally blocked)', () => {
    it('full DOCUMENTS_WRITE delegation → currently PASSES an unmarked POST route (e.g. create-doc)', async () => {
      delegationRepo.findOne.mockResolvedValue({
        status: DelegationStatus.ACTIVE,
        scopes: [DelegationScope.DOCUMENTS_READ, DelegationScope.DOCUMENTS_WRITE, DelegationScope.EXPENSES_APPROVE],
      });
      const { request, context } = makeContext('POST'); // no requiredScope override, mirrors create-doc
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user.firebaseId).toBe(CLIENT);
    });

    it('view-only delegation (EXPENSES_APPROVE, no DOCUMENTS_WRITE) → still blocked from an unmarked POST route', async () => {
      delegationRepo.findOne.mockResolvedValue({
        status: DelegationStatus.ACTIVE,
        scopes: [DelegationScope.DOCUMENTS_READ, DelegationScope.EXPENSES_APPROVE],
      });
      const { context } = makeContext('POST');
      await expect(guard.canActivate(context)).rejects.toThrow('לרואה חשבון הרשאה לצפייה בלבד');
    });
  });

  // The two server-derived impersonation states stay distinct: delegation is
  // backed by an ACTIVE Delegation row, while admin impersonation is backed by
  // the verified actor's persisted ADMIN role.
  describe('billing override flags', () => {
    it('real ACTIVE delegation → request.isDelegatedAccess = true', async () => {
      delegationRepo.findOne.mockResolvedValue({ status: DelegationStatus.ACTIVE, scopes: ['DOCUMENTS_READ'] });
      const { request, context } = makeContext('GET');
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.isDelegatedAccess).toBe(true);
      expect(request.isAdminImpersonation).toBeUndefined();
    });

    it('admin bypass → only request.isAdminImpersonation is set', async () => {
      userRepo.findOne.mockResolvedValue({ firebaseId: AGENT, role: [UserRole.ADMIN] });
      const { request, context } = makeContext('POST');
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.isDelegatedAccess).toBeUndefined();
      expect(request.isAdminImpersonation).toBe(true);
    });

    it('no impersonation (plain self-request) → neither override is set', async () => {
      const { request, context } = makeContext('GET', false);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.isDelegatedAccess).toBeUndefined();
      expect(request.isAdminImpersonation).toBeUndefined();
    });
  });
});
