import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BookingAccount } from './account.entity';
import { OwnerType } from '../enum';

/** Codes are allocated in jumps of this size within a range (D2). */
const ACCOUNT_CODE_JUMP = 10;

type AllocatableType = 'income' | 'expense';

/**
 * Per-(ownerType, type) allocation ranges (D2). Only 'income'/'expense' are
 * auto-allocated at runtime — balance-sheet/technical accounts (1000-2999,
 * the D14-decision-3 90000s) are hand-seeded, never through this service.
 * ACCOUNTANT and CLIENT intentionally share the same income range: they are
 * isolated from each other (and from SYSTEM) by chartOwnerKey, not by code
 * range — see D2's UNIQUE(chartOwnerKey, code).
 */
const ACCOUNT_CODE_RANGES: Record<OwnerType, Record<AllocatableType, [number, number]>> = {
  [OwnerType.SYSTEM]:     { income: [40000, 49999], expense: [60000, 69999] },
  [OwnerType.ACCOUNTANT]: { income: [50000, 59999], expense: [70000, 79999] },
  [OwnerType.CLIENT]:     { income: [50000, 59999], expense: [80000, 89999] },
};

@Injectable()
export class AccountCodeAllocatorService {
  constructor(
    @InjectRepository(BookingAccount)
    private readonly bookingAccountRepo: Repository<BookingAccount>,
  ) {}

  /**
   * Next free `booking_account.code` for (ownerType, type) within
   * chartOwnerKey (D2/1.5). Allocates in jumps of 10 from the highest
   * existing in-range code for that chartOwnerKey, or the range floor when
   * none exists yet.
   *
   * Manually-entered codes are tolerated without special-casing:
   *  - outside the (ownerType, type) range: ignored when computing the next
   *    code (they don't exist as far as this range's allocation is
   *    concerned; uniqueness across ranges is still enforced by the DB's
   *    UNIQUE(chartOwnerKey, code)).
   *  - inside the range but off the jump-10 grid (e.g. a manual 70005):
   *    the next allocation continues from it (70015), it just never
   *    collides because allocation always jumps forward from the true max.
   */
  async getNextAccountCode(
    params: { ownerType: OwnerType; type: AllocatableType; chartOwnerKey: string },
    manager?: EntityManager,
  ): Promise<string> {
    const { ownerType, type, chartOwnerKey } = params;

    const range = ACCOUNT_CODE_RANGES[ownerType]?.[type];
    if (!range) {
      throw new BadRequestException(
        `No allocatable account code range for ownerType=${ownerType}, type=${type}`,
      );
    }
    const [floor, ceiling] = range;

    const repo = manager ? manager.getRepository(BookingAccount) : this.bookingAccountRepo;
    const existing = await repo.find({ where: { chartOwnerKey }, select: ['code'] });

    const inRangeCodes = existing
      .map((a) => Number(a.code))
      .filter((n) => Number.isInteger(n) && n >= floor && n <= ceiling);

    const next = inRangeCodes.length ? Math.max(...inRangeCodes) + ACCOUNT_CODE_JUMP : floor;

    if (next > ceiling) {
      throw new BadRequestException(
        `Account code range ${floor}-${ceiling} (ownerType=${ownerType}, type=${type}, chartOwnerKey=${chartOwnerKey}) is exhausted`,
      );
    }

    return String(next);
  }
}
