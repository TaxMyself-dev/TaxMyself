/**
 * Unit tests: DelegationController.getUsersForAgent (Phase 0.3 / D12.3)
 *
 * The route was previously unguarded — any unauthenticated caller could
 * enumerate any agent's client list. Now: FirebaseAuthGuard + self-or-admin,
 * compared against actorFirebaseId (the caller's own identity, which survives
 * the impersonation swap).
 */
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DelegationController } from './delegation.controller';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';

const AGENT = 'agent-firebase-uid';

describe('DelegationController.getUsersForAgent', () => {
  let controller: DelegationController;
  let delegationService: { getUsersForAgent: jest.Mock };
  let usersService: { isAdmin: jest.Mock };

  beforeEach(() => {
    delegationService = { getUsersForAgent: jest.fn().mockResolvedValue([{ firebaseId: 'client-1' }]) };
    usersService = { isAdmin: jest.fn().mockResolvedValue(false) };
    controller = new DelegationController(delegationService as any, usersService as any);
  });

  function req(actorFirebaseId?: string) {
    return { user: actorFirebaseId ? { firebaseId: actorFirebaseId, role: 'user', actorFirebaseId } : undefined } as any;
  }

  it('route is protected by FirebaseAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller.getUsersForAgent);
    expect(guards).toContain(FirebaseAuthGuard);
  });

  it('agent querying own list → ok', async () => {
    await expect(controller.getUsersForAgent(req(AGENT), AGENT)).resolves.toEqual([{ firebaseId: 'client-1' }]);
    expect(delegationService.getUsersForAgent).toHaveBeenCalledWith(AGENT);
  });

  it('agent querying ANOTHER agent → 403', async () => {
    await expect(controller.getUsersForAgent(req('someone-else'), AGENT)).rejects.toThrow(ForbiddenException);
    expect(delegationService.getUsersForAgent).not.toHaveBeenCalled();
  });

  it('admin querying another agent → ok', async () => {
    usersService.isAdmin.mockResolvedValue(true);
    await expect(controller.getUsersForAgent(req('admin-uid'), AGENT)).resolves.toEqual([{ firebaseId: 'client-1' }]);
    expect(usersService.isAdmin).toHaveBeenCalledWith('admin-uid');
  });

  it('missing user context → 403', async () => {
    await expect(controller.getUsersForAgent(req(undefined), AGENT)).rejects.toThrow(ForbiddenException);
  });
});

/**
 * Unit tests: DelegationController.revokeDelegation
 *
 * Client-only action: the accountant on the other end of the delegation
 * must never be able to revoke it, including while impersonating the
 * client (x-client-user-id) — FirebaseAuthGuard marks any impersonated
 * request role: 'agent', regardless of whether it went through the
 * delegation path or the admin-bypass path, so blocking on role === 'agent'
 * here covers both.
 */
describe('DelegationController.revokeDelegation', () => {
  let controller: DelegationController;
  let delegationService: { revokeDelegation: jest.Mock };
  let usersService: { isAdmin: jest.Mock };

  const CLIENT = 'client-firebase-uid';

  beforeEach(() => {
    delegationService = { revokeDelegation: jest.fn().mockResolvedValue(undefined) };
    usersService = { isAdmin: jest.fn().mockResolvedValue(false) };
    controller = new DelegationController(delegationService as any, usersService as any);
  });

  function req(opts: { firebaseId?: string; role?: 'user' | 'agent' }) {
    return {
      user: opts.firebaseId ? { firebaseId: opts.firebaseId, role: opts.role ?? 'user' } : undefined,
    } as any;
  }

  it('route is protected by FirebaseAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller.revokeDelegation);
    expect(guards).toContain(FirebaseAuthGuard);
  });

  it('client revoking their own delegation → ok, delegates to the service', async () => {
    await expect(controller.revokeDelegation(req({ firebaseId: CLIENT }), 42)).resolves.toEqual({
      message: 'ההרשאה בוטלה בהצלחה',
    });
    expect(delegationService.revokeDelegation).toHaveBeenCalledWith(CLIENT, 42);
  });

  it('impersonated request (role: agent) → 403, service never called', async () => {
    await expect(
      controller.revokeDelegation(req({ firebaseId: CLIENT, role: 'agent' }), 42),
    ).rejects.toThrow(ForbiddenException);
    expect(delegationService.revokeDelegation).not.toHaveBeenCalled();
  });

  it('missing user context → 403', async () => {
    await expect(controller.revokeDelegation(req({}), 42)).rejects.toThrow(ForbiddenException);
    expect(delegationService.revokeDelegation).not.toHaveBeenCalled();
  });
});
