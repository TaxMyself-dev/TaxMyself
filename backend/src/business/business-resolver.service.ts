import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Business } from './business.entity';
import { BusinessService } from './business.service';

/**
 * Signals a future resolver can use to route an imported document to the
 * right business when a user owns more than one. Empty for now — the fields
 * are placeholders so callers already have a shape to pass and the multi-
 * business logic can grow here without touching call sites.
 */
export interface BusinessResolutionHints {
  /** Sender address of the source email (vendor rules). */
  senderEmail?: string | null;
  /** Business number detected from OCR / document content. */
  detectedBusinessNumber?: string | null;
}

/**
 * The single place that decides which business an imported document belongs
 * to when the caller did NOT specify one explicitly.
 *
 * Every import channel (Gmail import, manual upload, camera, future API /
 * email-forwarding) funnels through DocumentImportService, which asks this
 * resolver whenever `businessNumber` is absent. Keeping the decision here — and
 * out of the source adapters (Gmail) and the storage layer (Google Drive) —
 * gives future multi-business routing one home to grow in.
 */
@Injectable()
export class BusinessResolverService {
  private readonly logger = new Logger(BusinessResolverService.name);

  constructor(private readonly businessService: BusinessService) {}

  /**
   * Resolve the target business for a user's imported document.
   *
   * - No businesses: throws — nothing to import into.
   * - Exactly one business: returns it.
   * - Multiple businesses: returns the PRIMARY (first by id ASC, matching the
   *   existing convention in users.service — primary = first created). This
   *   preserves today's behavior until real multi-business routing lands.
   */
  async resolveTargetBusiness(
    firebaseId: string,
    hints?: BusinessResolutionHints,
  ): Promise<Business> {
    // getUserBusinesses already orders by id ASC, so [0] is the primary.
    const businesses = await this.businessService.getUserBusinesses(firebaseId);

    if (businesses.length === 0) {
      throw new NotFoundException(
        `No business found for this user — cannot resolve a target business for the import.`,
      );
    }

    if (businesses.length === 1) {
      return businesses[0];
    }

    // TODO(multi-business routing): the user owns more than one business.
    // Future resolution order (each step falls through to the next):
    //   1. Explicit user selection (passed as a hint / chosen in the UI).
    //   2. Vendor / sender rules (hints.senderEmail → mapped business).
    //   3. OCR / detected business number (hints.detectedBusinessNumber).
    //   4. AI classification of the document content.
    // Until then, preserve current behavior: route to the primary business.
    const primary = businesses[0];
    this.logger.log(
      `resolveTargetBusiness: firebaseId=${firebaseId} owns ${businesses.length} businesses — ` +
        `routing to primary (businessNumber=${primary.businessNumber ?? 'null'}, id=${primary.id}) ` +
        `until multi-business routing is implemented`,
    );
    return primary;
  }
}
