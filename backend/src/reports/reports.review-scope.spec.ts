/**
 * Unit tests: ReportsController "UNIFIED REVIEW PRE-FLIGHT" endpoints —
 * EXPENSES_APPROVE scope sweep.
 *
 * Context: update-doc/update-tx were missed when EXPENSES_APPROVE was
 * introduced and silently fell through to the generic per-verb DOCUMENTS_WRITE
 * default, breaking the supplier-save cascade and the row edit dialog for
 * any view-only-delegation accountant. A follow-up sweep found 6 more
 * routes with the same gap; delete-doc and upload-doc-to-tx were initially
 * flagged for a product decision rather than auto-fixed, and have since
 * been confirmed (2026-08-17) — delete-doc is a verified soft status-flip
 * (no hard delete, no file removal), upload-doc-to-tx is inbound evidence
 * attachment, not document issuance. This file:
 *  1. Confirms update-doc/update-tx (the originally reported bug) now carry
 *     EXPENSES_APPROVE and delegate correctly.
 *  2. Confirms every other pre-approval review/edit/organize endpoint found
 *     in the sweep (link-doc-to-tx, archive-doc, doc-kind, unpair,
 *     reject-tx, file-doc, delete-doc, upload-doc-to-tx) also carries
 *     EXPENSES_APPROVE — all 10 routes are now consistently scoped.
 *  3. An enumeration audit (`describe('scope-override audit')`) that walks
 *     every 'me/review/*' write route on the controller and fails if a
 *     FUTURE route is added without either an explicit
 *     @RequiredDelegationScope override or an explicit entry in the
 *     KNOWN_GENERIC_DEFAULT_ROUTES allowlist below (currently empty — kept
 *     as a mechanism for the next time something genuinely needs to stay
 *     on the generic default) — so this class of bug can't recur unnoticed
 *     a third time.
 */
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { REQUIRED_DELEGATION_SCOPE_KEY } from '../decorators/required-delegation-scope.decorator';
import { DelegationScope } from '../delegation/delegation.entity';

describe('ReportsController — review-workflow EXPENSES_APPROVE scope sweep', () => {
  let controller: ReportsController;
  let reviewService: Record<string, jest.Mock>;

  beforeEach(() => {
    reviewService = {
      updateDocFields: jest.fn().mockResolvedValue({ ok: true }),
      updateTxFields: jest.fn().mockResolvedValue({ ok: true }),
      linkDocToTx: jest.fn().mockResolvedValue({ ok: true }),
      archiveDoc: jest.fn().mockResolvedValue({ ok: true }),
      setDocKind: jest.fn().mockResolvedValue({ ok: true }),
      unpair: jest.fn().mockResolvedValue({ ok: true }),
      rejectTx: jest.fn().mockResolvedValue({ ok: true }),
      fileDocAsAnnual: jest.fn().mockResolvedValue({ ok: true }),
      deleteDoc: jest.fn().mockResolvedValue({ ok: true }),
      uploadDocAndLinkToTx: jest.fn().mockResolvedValue({ ok: true }),
    };
    controller = new ReportsController(
      {} as any, // reportsService — unused by these routes
      reviewService as any,
      {} as any, // sharedService — unused by these routes
      {} as any, // usersService — unused by these routes
    );
  });

  function req(firebaseId = 'client-1') {
    return { user: { firebaseId } } as any;
  }

  // The reported bug: view-only accountant (EXPENSES_APPROVE, no
  // DOCUMENTS_WRITE) must be able to save an in-progress edit onto a
  // pending row — both the supplier-cascade path and the edit dialog's own
  // save hit these two routes.
  describe('update-doc / update-tx (the reported bug)', () => {
    it('updateDoc requires EXPENSES_APPROVE, not the generic DOCUMENTS_WRITE default', () => {
      const scope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, controller.updateDoc);
      expect(scope).toBe(DelegationScope.EXPENSES_APPROVE);
    });

    it('updateDoc delegates to the service with the impersonated (client) firebaseId', async () => {
      await controller.updateDoc(req(), '7', { businessNumber: '123456789', fields: { category: 'x' } as any });
      expect(reviewService.updateDocFields).toHaveBeenCalledWith('client-1', '123456789', 7, { category: 'x' });
    });

    it('updateTx requires EXPENSES_APPROVE, not the generic DOCUMENTS_WRITE default', () => {
      const scope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, controller.updateTx);
      expect(scope).toBe(DelegationScope.EXPENSES_APPROVE);
    });

    it('updateTx delegates to the service with the impersonated (client) firebaseId', async () => {
      await controller.updateTx(req(), '9', { businessNumber: '123456789', fields: { vatPercent: 17 } as any });
      expect(reviewService.updateTxFields).toHaveBeenCalledWith('client-1', '123456789', 9, { vatPercent: 17 });
    });
  });

  // Rest of the sweep: same "edit/organize a pending row before approval"
  // category as update-doc/update-tx and the already-correct approve-*
  // endpoints. delete-doc (verified soft status-flip, no hard delete/file
  // removal) and upload-doc-to-tx (inbound evidence attachment, not
  // document issuance — and actively used from report-review.page.ts's
  // tx_only upload flow, not dormant) were confirmed by the product owner
  // on 2026-08-17 and belong in this same bucket.
  describe('other pre-approval review/edit/organize endpoints found in the sweep', () => {
    const mockFile = { originalname: 'invoice.pdf' } as Express.Multer.File;
    const cases: [string, string, () => Promise<unknown>][] = [
      ['linkDocToTx', 'linkDocToTx', () => controller.linkDocToTx(req(), { businessNumber: '1', documentId: 1, transactionId: 2 })],
      ['archiveDoc', 'archiveDoc', () => controller.archiveDoc(req(), '1')],
      ['setDocKind', 'setDocKind', () => controller.setDocKind(req(), '1', { documentKind: 'EXPENSE_INVOICE' as any })],
      ['unpair', 'unpair', () => controller.unpair(req(), '1')],
      ['rejectTx', 'rejectTx', () => controller.rejectTx(req(), { businessNumber: '1', transactionId: 2 })],
      ['fileDocAsAnnual', 'fileDocAsAnnual', () => controller.fileDocAsAnnual(req(), '1')],
      ['deleteDoc', 'deleteDoc', () => controller.deleteDoc(req(), '1')],
      ['uploadDocToTx', 'uploadDocAndLinkToTx', () => controller.uploadDocToTx(req(), '3', { businessNumber: '1' }, mockFile)],
    ];

    it.each(cases)('%s requires EXPENSES_APPROVE', (methodName) => {
      const scope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, (controller as any)[methodName]);
      expect(scope).toBe(DelegationScope.EXPENSES_APPROVE);
    });

    it.each(cases)('%s still delegates to the service', async (_label, serviceMockName, callFn) => {
      await callFn();
      expect((reviewService as any)[serviceMockName]).toHaveBeenCalledTimes(1);
    });

    it('deleteDoc forwards the optional rejection reason', async () => {
      await controller.deleteDoc(req(), '17', { rejectionReason: 'מסמך כפול' });

      expect(reviewService.deleteDoc).toHaveBeenCalledWith(
        'client-1',
        17,
        'מסמך כפול',
      );
    });
  });

  it('every review-workflow route stays behind FirebaseAuthGuard regardless of scope override', () => {
    for (const methodName of ['updateDoc', 'updateTx', 'linkDocToTx', 'archiveDoc', 'setDocKind', 'unpair', 'rejectTx', 'fileDocAsAnnual', 'deleteDoc', 'uploadDocToTx']) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, (controller as any)[methodName]);
      expect(guards).toContain(FirebaseAuthGuard);
    }
  });

  /**
   * Enumeration audit — walks every route on ReportsController whose path
   * starts with 'me/review/' and whose HTTP method is a write (POST/PATCH/
   * PUT/DELETE — GET is never scope-gated, see FirebaseAuthGuard), and
   * requires each one to EITHER carry an explicit @RequiredDelegationScope
   * override OR be named in KNOWN_GENERIC_DEFAULT_ROUTES below (routes
   * reviewed and deliberately left on the DOCUMENTS_WRITE default, each
   * with a comment at its declaration explaining why).
   *
   * A future route added to this controller's review workflow without
   * either of those two things will fail this test — forcing a conscious
   * classification decision instead of silently inheriting the generic
   * per-verb default, which is exactly the bug class this whole ticket is
   * about (update-doc/update-tx did precisely this and it took a production
   * report to notice).
   */
  describe('scope-override audit — every me/review/* write route must be a conscious decision', () => {
    // Empty as of 2026-08-17 — delete-doc and upload-doc-to-tx (the last two
    // routes here) were confirmed as EXPENSES_APPROVE and removed from this
    // list. Kept as a mechanism, not deleted: the next route that genuinely
    // needs to stay on the generic DOCUMENTS_WRITE default goes here, named,
    // with a comment at its declaration explaining why — never silently.
    const KNOWN_GENERIC_DEFAULT_ROUTES = new Set<string>([]);
    const WRITE_METHODS = new Set([RequestMethod.POST, RequestMethod.PATCH, RequestMethod.PUT, RequestMethod.DELETE]);

    it('lists every me/review/* write route and its scope classification', () => {
      const proto = ReportsController.prototype as any;
      const reviewWriteRoutes = Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
        .map((name) => ({
          name,
          path: Reflect.getMetadata(PATH_METADATA, proto[name]) as string | undefined,
          method: Reflect.getMetadata(METHOD_METADATA, proto[name]) as RequestMethod | undefined,
        }))
        .filter((r) => typeof r.path === 'string' && r.path.startsWith('me/review/') && r.method !== undefined && WRITE_METHODS.has(r.method));

      // Sanity check the audit itself is actually finding routes — an empty
      // list would make every assertion below vacuously true.
      expect(reviewWriteRoutes.length).toBeGreaterThanOrEqual(10);

      for (const route of reviewWriteRoutes) {
        const scope = Reflect.getMetadata(REQUIRED_DELEGATION_SCOPE_KEY, proto[route.name]);
        const isClassified = scope !== undefined || KNOWN_GENERIC_DEFAULT_ROUTES.has(route.name);
        expect({ route: route.name, path: route.path, classified: isClassified }).toEqual({
          route: route.name, path: route.path, classified: true,
        });
      }
    });
  });
});
