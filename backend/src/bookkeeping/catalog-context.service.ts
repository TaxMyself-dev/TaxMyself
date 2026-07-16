import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delegation, DelegationStatus } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { UserRole } from 'src/enum';
import { CatalogContext } from './catalog.service';

/**
 * Phase 5.1 — delegation-aware CatalogContext construction.
 *
 * The ACCOUNTANT catalog layer (D4) is visible to a client through their
 * ACTIVE delegations: every agent holding an ACTIVE delegation on the user
 * contributes an ACCOUNTANT_<agentFirebaseId> chart to the merge, ranked
 * between the CLIENT chart and SYSTEM. Visibility is deliberately NOT gated
 * on write scopes — a READ-only delegation still means this accountant
 * services the client, so the accountant's shared catalog rows
 * (visibilityScope=ALL_ACCOUNTANT_CLIENTS) apply to the client's merged
 * catalog either way; scopes gate CAPABILITIES (writes), not visibility (D9).
 */
@Injectable()
export class CatalogContextService {
  constructor(
    @InjectRepository(Delegation) private readonly delegationRepo: Repository<Delegation>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
  ) {}

  /**
   * Phase 6 hardening: the effective user must OWN the business they act
   * on. Every business row (incl. the spouse's, MULTI_BUSINESS) carries the
   * signed-in user's firebaseId, and impersonation swaps the effective
   * firebaseId to the client after the guard validated the delegation — so
   * a plain (businessNumber, firebaseId) match is the complete predicate.
   * Before this, any authenticated user could pass a foreign businessNumber
   * to the catalog/chart endpoints and read that tenant's custom names.
   */
  async assertBusinessAccess(
    firebaseId?: string | null,
    businessNumber?: string | null,
  ): Promise<void> {
    if (!firebaseId || !businessNumber) return;
    const business = await this.businessRepo.findOne({
      where: { businessNumber, firebaseId },
    });
    if (!business) {
      throw new ForbiddenException('אין הרשאה לעסק זה');
    }
  }

  /** Read-context for a user acting on a business: CLIENT chart + every
   *  ACTIVE delegation's ACCOUNTANT chart + SYSTEM. Asserts business
   *  ownership (see assertBusinessAccess) so every consumer is covered. */
  async forUser(
    firebaseId?: string | null,
    businessNumber?: string | null,
  ): Promise<CatalogContext> {
    await this.assertBusinessAccess(firebaseId, businessNumber);
    const accountantIds = firebaseId ? await this.accountantIdsForUser(firebaseId) : [];
    return { userId: firebaseId ?? null, businessNumber: businessNumber ?? null, accountantIds };
  }

  /** Agent firebaseIds holding an ACTIVE delegation on this user, ordered by
   *  delegation id so the (rare) multi-accountant merge precedence is
   *  deterministic. */
  async accountantIdsForUser(firebaseId: string): Promise<string[]> {
    const rows = await this.delegationRepo.find({
      where: { userId: firebaseId, status: DelegationStatus.ACTIVE },
      order: { id: 'ASC' },
    });
    return [...new Set(rows.map((r) => r.agentId))];
  }

  /** Client firebaseIds this agent holds an ACTIVE delegation on — the 5.4
   *  pending-approvals queue fans out over these. */
  async activeClientIdsForAgent(agentFirebaseId: string): Promise<string[]> {
    const rows = await this.delegationRepo.find({
      where: { agentId: agentFirebaseId, status: DelegationStatus.ACTIVE },
      order: { id: 'ASC' },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  async isAdmin(firebaseId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { firebaseId } });
    return user?.role?.includes(UserRole.ADMIN) ?? false;
  }

  /** D11 gate: only accountants (or platform admins) may create
   *  accountant-layer chart rows. */
  async isAccountantOrAdmin(firebaseId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user?.role) return false;
    return user.role.includes(UserRole.ACCOUNTANT) || user.role.includes(UserRole.ADMIN);
  }
}
