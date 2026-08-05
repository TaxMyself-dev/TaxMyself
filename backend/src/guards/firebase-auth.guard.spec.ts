/**
 * Unit tests: FirebaseAuthGuard (Phase 0.3 / D12.2)
 *
 * Covers the impersonation hardening:
 *  - delegation lookup filters status = ACTIVE (REVOKED rows no longer grant access)
 *  - write methods (POST/PUT/PATCH/DELETE) require DOCUMENTS_WRITE scope;
 *    NULL-scopes legacy rows are read-only
 *  - actorFirebaseId preserves the caller's own identity through the swap
 *  - admin bypass unaffected by scope enforcement
 */
import { ForbiddenException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { DelegationStatus } from '../delegation/delegation.entity';
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
    guard = new FirebaseAuthGuard(delegationRepo as any, userRepo as any);
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: AGENT }),
    } as any);
  });

  afterEach(() => jest.restoreAllMocks());

  function makeContext(method: string, impersonate = true) {
    const request: any = {
      method,
      headers: {
        authorization: 'Bearer fake-token',
        businessnumber: '123456789',
        ...(impersonate ? { 'x-client-user-id': CLIENT } : {}),
      },
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
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
    expect(delegationRepo.findOne).not.toHaveBeenCalled();
  });
});
