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
