/**
 * Unit tests: CatalogContextService (Phase 5.1)
 *
 * Covers:
 *  - forUser: accountantIds come only from ACTIVE delegations, deterministic
 *    order, deduplicated; no firebaseId → empty accountant layer
 *  - activeClientIdsForAgent (5.4 pending-approvals fan-out)
 *  - isAdmin / isAccountantOrAdmin role gates (D11)
 */
import { CatalogContextService } from './catalog-context.service';
import { DelegationStatus } from '../delegation/delegation.entity';
import { UserRole } from '../enum';

function makeRepo<T>(rows: T[] = []) {
  return {
    rows,
    find: jest.fn(async (opts: any) => {
      const filtered = rows.filter((r: any) =>
        Object.entries(opts?.where ?? {}).every(([k, v]) => r[k] === v),
      );
      const orderKey = opts?.order ? Object.keys(opts.order)[0] : null;
      if (orderKey) filtered.sort((a: any, b: any) => (a[orderKey] > b[orderKey] ? 1 : -1));
      return filtered;
    }),
    findOne: jest.fn(async (opts: any) =>
      rows.find((r: any) => Object.entries(opts?.where ?? {}).every(([k, v]) => r[k] === v)) ?? null,
    ),
  };
}

describe('CatalogContextService', () => {
  let delegationRepo: ReturnType<typeof makeRepo<any>>;
  let userRepo: ReturnType<typeof makeRepo<any>>;
  let service: CatalogContextService;

  beforeEach(() => {
    delegationRepo = makeRepo<any>([
      { id: 1, userId: 'client-1', agentId: 'agent-A', status: DelegationStatus.ACTIVE },
      { id: 2, userId: 'client-1', agentId: 'agent-B', status: DelegationStatus.ACTIVE },
      { id: 3, userId: 'client-1', agentId: 'agent-C', status: DelegationStatus.REVOKED },
      { id: 4, userId: 'client-2', agentId: 'agent-A', status: DelegationStatus.ACTIVE },
      { id: 5, userId: 'client-3', agentId: 'agent-A', status: DelegationStatus.REVOKED },
    ]);
    userRepo = makeRepo<any>([
      { firebaseId: 'admin-1', role: [UserRole.ADMIN] },
      { firebaseId: 'agent-A', role: [UserRole.ACCOUNTANT] },
      { firebaseId: 'client-1', role: [UserRole.REGULAR] },
      { firebaseId: 'no-role', role: null },
    ]);
    service = new CatalogContextService(delegationRepo as any, userRepo as any);
  });

  describe('forUser', () => {
    it('builds the accountant layer from ACTIVE delegations only, in delegation-id order', async () => {
      const ctx = await service.forUser('client-1', '123456789');
      expect(ctx).toEqual({
        userId: 'client-1',
        businessNumber: '123456789',
        accountantIds: ['agent-A', 'agent-B'],
      });
    });

    it('no firebaseId → empty accountant layer', async () => {
      const ctx = await service.forUser(null, '123456789');
      expect(ctx.accountantIds).toEqual([]);
      expect(delegationRepo.find).not.toHaveBeenCalled();
    });

    it('user with no delegations → empty accountant layer', async () => {
      const ctx = await service.forUser('client-999', '123456789');
      expect(ctx.accountantIds).toEqual([]);
    });

    it('REVOKED delegations grant no catalog visibility', async () => {
      const ctx = await service.forUser('client-3', '123456789');
      expect(ctx.accountantIds).toEqual([]);
    });
  });

  describe('activeClientIdsForAgent', () => {
    it('returns ACTIVE clients only', async () => {
      const clients = await service.activeClientIdsForAgent('agent-A');
      expect(clients).toEqual(['client-1', 'client-2']);
    });
  });

  describe('role gates', () => {
    it('isAdmin true only for ADMIN role', async () => {
      expect(await service.isAdmin('admin-1')).toBe(true);
      expect(await service.isAdmin('agent-A')).toBe(false);
      expect(await service.isAdmin('missing')).toBe(false);
    });

    it('isAccountantOrAdmin true for ACCOUNTANT and ADMIN, false otherwise', async () => {
      expect(await service.isAccountantOrAdmin('agent-A')).toBe(true);
      expect(await service.isAccountantOrAdmin('admin-1')).toBe(true);
      expect(await service.isAccountantOrAdmin('client-1')).toBe(false);
      expect(await service.isAccountantOrAdmin('no-role')).toBe(false);
      expect(await service.isAccountantOrAdmin('missing')).toBe(false);
    });
  });
});
