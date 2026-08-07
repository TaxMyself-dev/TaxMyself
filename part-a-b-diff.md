# Diff מלא — חלק א׳ (שמירה חוסמת) + חלק ב׳ (cascade דרך דיאלוג הספק)

עדיין לא בוצע commit.

```diff
diff --git a/backend/src/documents/extracted-document.entity.ts b/backend/src/documents/extracted-document.entity.ts
index b812e98f..c7cd62f2 100644
--- a/backend/src/documents/extracted-document.entity.ts
+++ b/backend/src/documents/extracted-document.entity.ts
@@ -6,7 +6,7 @@ import {
   PrimaryGeneratedColumn,
   UpdateDateColumn,
 } from 'typeorm';
-import { DocumentKind } from 'src/enum';
+import { DocumentKind, ReportPeriodLabel } from 'src/enum';
 
 export enum ExtractedDocStatus {
   /** OCR succeeded, awaiting user review in the report-page modal. */
@@ -299,4 +299,17 @@ export class ExtractedDocument {
    */
   @Column({ name: 'document_kind', type: 'varchar', length: 32, nullable: true, default: null })
   documentKind: DocumentKind | null;
+
+  /**
+   * VAT-report period label ("M/YYYY" / "M1-M2/YYYY"), stamped when the
+   * user picks an explicit period override in the review edit dialog
+   * before approval (see ReportReviewService.updateDocFields). Mirrors
+   * SlimTransaction/Expense/FullTransactionCache's own vatReportingDate —
+   * same property name, this entity's own snake_case column-naming
+   * convention. Nullable: most docs never get an explicit pre-approval
+   * period stamp; approve always computes/stamps the final period onto
+   * the Expense/SlimTransaction regardless of this column.
+   */
+  @Column({ name: 'vat_reporting_date', type: 'varchar', nullable: true, default: null })
+  vatReportingDate: ReportPeriodLabel | null;
 }
diff --git a/backend/src/reports/report-review.service.ts b/backend/src/reports/report-review.service.ts
index 90deb95f..034e95c2 100644
--- a/backend/src/reports/report-review.service.ts
+++ b/backend/src/reports/report-review.service.ts
@@ -106,6 +106,37 @@ export interface ReviewOverrides {
   amount?: number;
 }
 
+/**
+ * Fields the review edit dialog can persist directly onto a pending
+ * ExtractedDocument BEFORE approval (see ReportReviewService.
+ * updateDocFields) — every ReviewOverrides field that actually has a
+ * backing column on this entity. Excludes: saveAsSupplier/
+ * acknowledgeDuplicate (approve-time-only behavior flags, no column
+ * anywhere).
+ */
+export type UpdateDocFields = Pick<ReviewOverrides,
+  | 'category' | 'subCategory' | 'subCategoryId'
+  | 'vatPercent' | 'taxPercent' | 'isEquipment'
+  | 'date' | 'amount' | 'supplierId' | 'supplier'
+  | 'invoiceNumber' | 'allocationNumber' | 'documentType'
+  | 'reportPeriod'
+>;
+
+/**
+ * Fields the review edit dialog can persist directly onto a pending
+ * SlimTransaction BEFORE approval (see ReportReviewService.
+ * updateTxFields). A bank transaction has no document-side concept
+ * (supplier identity, invoice/allocation number, document type) and no
+ * date/amount column of its own (those live on FullTransactionCache,
+ * synced from the bank feed — not user-editable here) — so this is a much
+ * narrower subset than UpdateDocFields.
+ */
+export type UpdateTxFields = Pick<ReviewOverrides,
+  | 'category' | 'subCategory' | 'subCategoryId'
+  | 'vatPercent' | 'taxPercent' | 'isEquipment'
+  | 'reportPeriod'
+>;
+
 /**
  * Owns the unified report-review pre-flight: the pipeline that runs before
  * the VAT or P&L report renders, gathering anything the user still needs
@@ -1308,6 +1339,95 @@ export class ReportReviewService {
     }
   }
 
+  // ====================================================================
+  // IN-PROGRESS EDIT SAVE (blocking — not approve, no status change)
+  // ====================================================================
+
+  /**
+   * Persist an in-progress edit onto the pending document row itself.
+   * NOT an approve — status/confirmedExpenseId/documentKind are untouched
+   * (this row still needs approve-time classification resolution, D9
+   * mapping, journal posting, etc.). Lets the review edit dialog save
+   * immediately instead of only carrying the change in-memory until the
+   * user clicks approve — which could be minutes/rows later, or never,
+   * if they navigate away first (loadPreview would then re-fetch the
+   * un-edited raw DB row and silently drop the edit).
+   *
+   * Covers matched rows too (source of truth is the document — see
+   * approveMatched's "doc wins over slim" comment).
+   */
+  async updateDocFields(
+    firebaseId: string,
+    businessNumber: string,
+    documentId: number,
+    fields: UpdateDocFields,
+  ): Promise<{ ok: true }> {
+    const doc = await this.docRepo.findOne({ where: { id: documentId } });
+    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
+    await this.assertDocOwnership(doc, firebaseId, businessNumber);
+    if (doc.status !== ExtractedDocStatus.PENDING_REVIEW) {
+      throw new BadRequestException(
+        `Document ${documentId} is not pending_review (status=${doc.status})`,
+      );
+    }
+    // Same guard approveMatched applies — an annual document is never an
+    // expense, so classifying it doesn't make sense.
+    if (doc.documentKind === DocumentKind.ANNUAL_DOCUMENT) {
+      throw new BadRequestException('מסמך שנתי — לא ניתן לערוך סיווג הוצאה עבורו');
+    }
+
+    const patch: Partial<ExtractedDocument> = {};
+    if (fields.category !== undefined) patch.category = fields.category ?? null;
+    if (fields.subCategory !== undefined) patch.subCategory = fields.subCategory ?? null;
+    if (fields.subCategoryId !== undefined) patch.subCategoryId = fields.subCategoryId ?? null;
+    if (fields.vatPercent !== undefined) patch.vatPercent = fields.vatPercent as any;
+    if (fields.taxPercent !== undefined) patch.taxPercent = fields.taxPercent as any;
+    if (fields.isEquipment !== undefined) patch.isEquipment = fields.isEquipment ?? null;
+    if (fields.date !== undefined) patch.date = fields.date ?? null;
+    if (fields.amount !== undefined) patch.amount = fields.amount as any;
+    if (fields.supplierId !== undefined) patch.supplierId = fields.supplierId ?? null;
+    if (fields.supplier !== undefined) patch.supplier = fields.supplier ?? null;
+    if (fields.invoiceNumber !== undefined) patch.invoiceNumber = fields.invoiceNumber ?? null;
+    if (fields.allocationNumber !== undefined) patch.allocationNumber = fields.allocationNumber ?? null;
+    if (fields.documentType !== undefined) patch.documentType = (fields.documentType as any) ?? null;
+    if (fields.reportPeriod !== undefined) patch.vatReportingDate = (fields.reportPeriod as any) ?? null;
+
+    if (Object.keys(patch).length > 0) {
+      await this.docRepo.update({ id: documentId }, patch);
+    }
+    return { ok: true };
+  }
+
+  /**
+   * Persist an in-progress edit onto the pending slim transaction itself.
+   * NOT an approve — `confirmed`/`isRecognized` are untouched. See
+   * updateDocFields's doc comment for the "why persist before approve"
+   * rationale. Reuses loadTxPair's existing ownership/businessNumber/
+   * not-already-confirmed guard.
+   */
+  async updateTxFields(
+    firebaseId: string,
+    businessNumber: string,
+    slimTransactionId: number,
+    fields: UpdateTxFields,
+  ): Promise<{ ok: true }> {
+    const { slim } = await this.loadTxPair(firebaseId, businessNumber, slimTransactionId);
+
+    const patch: Partial<SlimTransaction> = {};
+    if (fields.category !== undefined && fields.category != null) patch.category = fields.category;
+    if (fields.subCategory !== undefined && fields.subCategory != null) patch.subCategory = fields.subCategory;
+    if (fields.subCategoryId !== undefined) patch.subCategoryId = fields.subCategoryId ?? null;
+    if (fields.vatPercent !== undefined) patch.vatPercent = fields.vatPercent;
+    if (fields.taxPercent !== undefined) patch.taxPercent = fields.taxPercent;
+    if (fields.isEquipment !== undefined) patch.isEquipment = fields.isEquipment ?? false;
+    if (fields.reportPeriod !== undefined) patch.vatReportingDate = (fields.reportPeriod as any) ?? null;
+
+    if (Object.keys(patch).length > 0) {
+      await this.slimRepo.update({ id: slim.id }, patch);
+    }
+    return { ok: true };
+  }
+
   private async linkOwnershipCheckTx(
     firebaseId: string,
     businessNumber: string,
diff --git a/backend/src/reports/reports.controller.ts b/backend/src/reports/reports.controller.ts
index f6648302..cbd07233 100644
--- a/backend/src/reports/reports.controller.ts
+++ b/backend/src/reports/reports.controller.ts
@@ -3,7 +3,7 @@ import { Response } from 'express';
 import { Controller, Post, Patch, Get, Query, Param, Body, Headers, UseGuards, ValidationPipe, Res, Req, UploadedFile, UseInterceptors, HttpException, HttpStatus, UsePipes, BadRequestException} from '@nestjs/common';
 //Services
 import { ReportsService } from './reports.service';
-import { ReportReviewService, ReviewOverrides } from './report-review.service';
+import { ReportReviewService, ReviewOverrides, UpdateDocFields, UpdateTxFields } from './report-review.service';
 import { SharedService } from '../shared/shared.service';
 import { UsersService } from '../users/users.service';
 import { VatReportRequestDto } from './dtos/vat-report-request.dto';
@@ -136,6 +136,40 @@ export class ReportsController {
       return this.reviewService.approveTxNoDoc(firebaseId, bn, Number(body.transactionId), body.overrides ?? {});
     }
 
+    /** Persist an in-progress edit onto a pending document (matched/
+     *  doc_only) — NOT an approve, status/documentKind untouched. Lets the
+     *  edit dialog save immediately instead of only carrying the change
+     *  in-memory until the user clicks approve. */
+    @Patch('me/review/update-doc/:documentId')
+    @UseGuards(FirebaseAuthGuard)
+    async updateDoc(
+      @Req() request: AuthenticatedRequest,
+      @Param('documentId') documentId: string,
+      @Body() body: { businessNumber: string; fields?: UpdateDocFields },
+    ) {
+      const firebaseId = request.user?.firebaseId;
+      if (!firebaseId) throw new BadRequestException('Not authenticated');
+      const bn = body?.businessNumber?.trim();
+      if (!bn) throw new BadRequestException('businessNumber is required');
+      return this.reviewService.updateDocFields(firebaseId, bn, Number(documentId), body.fields ?? {});
+    }
+
+    /** Same as update-doc, for the transaction side of a tx_only row. */
+    @Patch('me/review/update-tx/:slimTransactionId')
+    @RequireModule(ModuleName.OPEN_BANKING)
+    @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
+    async updateTx(
+      @Req() request: AuthenticatedRequest,
+      @Param('slimTransactionId') slimTransactionId: string,
+      @Body() body: { businessNumber: string; fields?: UpdateTxFields },
+    ) {
+      const firebaseId = request.user?.firebaseId;
+      if (!firebaseId) throw new BadRequestException('Not authenticated');
+      const bn = body?.businessNumber?.trim();
+      if (!bn) throw new BadRequestException('businessNumber is required');
+      return this.reviewService.updateTxFields(firebaseId, bn, Number(slimTransactionId), body.fields ?? {});
+    }
+
     /** Manual link from a tx_only row to an existing doc_only document. */
     @Post('me/review/link-doc-to-tx')
     @UseGuards(FirebaseAuthGuard)
diff --git a/backend/src/transactions/slim-transaction.entity.ts b/backend/src/transactions/slim-transaction.entity.ts
index 04d87912..690709e5 100644
--- a/backend/src/transactions/slim-transaction.entity.ts
+++ b/backend/src/transactions/slim-transaction.entity.ts
@@ -114,5 +114,15 @@ export class SlimTransaction {
 
   @UpdateDateColumn()
   updatedAt: Date;
+
+  /**
+   * Nullable pointer at sub_category.id (D1 thin-pointer model) — mirrors
+   * Supplier.subCategoryId / ExtractedDocument.subCategoryId. Stamped when
+   * the user edits a tx_only/matched row's classification pre-approval
+   * (see ReportReviewService.updateTxFields); approve's classification
+   * always resolves from ReviewOverrides regardless of this column.
+   */
+  @Column({ name: 'sub_category_id', type: 'int', nullable: true, default: null })
+  subCategoryId: number | null;
 }
 
diff --git a/docs/redesign/cutover.sql b/docs/redesign/cutover.sql
index 8ff14e53..44688181 100644
--- a/docs/redesign/cutover.sql
+++ b/docs/redesign/cutover.sql
@@ -1492,3 +1492,43 @@ COMMIT;
 -- purely additive: no existing category/sub_category/booking_account name
 -- collides with these, so no existing row is touched.
 -- ============================================================================
+
+
+-- ============================================================================
+-- SECTION 9 (2026-08-06, Elazar) — blocking single-row save + supplier-
+-- driven cascade in the report-review edit dialogs (new
+-- reports/me/review/update-doc and update-tx endpoints).
+--
+-- Two new NULLable columns so a review row's classification can be
+-- persisted onto its pending source row (extracted_document /
+-- slim_transactions) BEFORE approval, instead of only living in-memory
+-- until the user clicks approve:
+--
+--   - `extracted_document.vat_reporting_date` — this table had NO period
+--     column at all before this section (only slim_transactions did).
+--     Mirrors the property name already used everywhere else
+--     (SlimTransaction/Expense/FullTransactionCache.vatReportingDate),
+--     snake_case column name matching this entity's own convention
+--     (supplier_id, sub_category_id, document_kind, ...).
+--   - `slim_transactions.subCategoryId` — this table had no D1 thin-
+--     pointer column at all before this section (Supplier and
+--     extracted_document already do). camelCase column name — per
+--     Elazar's explicit choice this round (diverges from this entity's
+--     own no-explicit-name convention elsewhere, intentionally).
+--
+-- Both NULLable with no default-value backfill in this script — existing
+-- rows simply read NULL (equivalent to "no pre-approval edit was ever
+-- saved for this row yet", which is true for every row that predates this
+-- feature). No data migration needed or included here.
+-- ============================================================================
+
+ALTER TABLE `extracted_document`
+  ADD COLUMN `vat_reporting_date` varchar(255) NULL DEFAULT NULL;
+
+ALTER TABLE `slim_transactions`
+  ADD COLUMN `subCategoryId` int NULL DEFAULT NULL;
+
+-- Verification (run after applying, expect 1 row from both):
+--   SHOW COLUMNS FROM extracted_document LIKE 'vat_reporting_date';
+--   SHOW COLUMNS FROM slim_transactions LIKE 'subCategoryId';
+-- ============================================================================
diff --git a/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.html b/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.html
index 4e99dc9a..20903d1a 100644
--- a/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.html
+++ b/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.html
@@ -114,13 +114,6 @@
           </select>
         </label>
 
-        <label class="field field--wide checkbox-field">
-          <input type="checkbox"
-                 [ngModel]="f.applyCascadeToSuppliers"
-                 (ngModelChange)="fieldsChange.emit({ applyCascadeToSuppliers: $event })" />
-          <span>החל סיווג זה גם על שורות זהות בטבלה</span>
-        </label>
-
         <label class="field field--wide checkbox-field" *ngIf="showNewSupplierFlag">
           <input type="checkbox"
                  [ngModel]="f.saveAsSupplier"
@@ -145,12 +138,14 @@
         [buttonColor]="ButtonColor.BLACK"
         [buttonSize]="ButtonSize.AUTO"
         [variant]="'outlined'"
+        [disabled]="isSaving"
         (onButtonClicked)="visibleChange.emit(false)">
       </app-p-button>
       <app-p-button
         [buttonText]="'שמור'"
         [buttonColor]="ButtonColor.BLACK"
         [buttonSize]="ButtonSize.AUTO"
+        [isLoading]="isSaving"
         (onButtonClicked)="save.emit()">
       </app-p-button>
     </div>
diff --git a/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.ts b/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.ts
index 06d94dd4..6f98263f 100644
--- a/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.ts
+++ b/frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.ts
@@ -26,9 +26,6 @@ export interface ExpenseEditFieldValues {
   supplier: string;
   reportPeriod: string;
   reportPeriodOverridden: boolean;
-  /** Checked by default — the caller cascades the classification onto
-   *  every sibling row sharing this supplier when true. */
-  applyCascadeToSuppliers: boolean;
   /** Doc-only fields — undefined/ignored when hasDocument is false. */
   allocationNumber?: string;
   documentType?: string | null;
@@ -79,6 +76,9 @@ export class ReportReviewEditDialogComponent {
    *  customPeriodRequested instead of periodChange. */
   @Input() periodOptions: { value: string; label: string; isCustom?: boolean }[] = [];
   @Input() showNewSupplierFlag = false;
+  /** True while a blocking save (onEditDialogSave) is in flight — disables
+   *  the footer buttons and shows a spinner on "שמור". */
+  @Input() isSaving = false;
 
   @Output() visibleChange = new EventEmitter<boolean>();
   @Output() save = new EventEmitter<void>();
@@ -89,7 +89,7 @@ export class ReportReviewEditDialogComponent {
   @Output() customPeriodRequested = new EventEmitter<void>();
   /** Generic patch for every field with no cascade/resolution side-effect
    *  (vatPercent, taxPercent, date, amount, supplierId, supplier,
-   *  allocationNumber, documentType, saveAsSupplier, applyCascadeToSuppliers). */
+   *  allocationNumber, documentType, saveAsSupplier). */
   @Output() fieldsChange = new EventEmitter<Partial<ExpenseEditFieldValues>>();
 
   previewUrl(): SafeResourceUrl | null {
diff --git a/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.html b/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.html
index a0d66720..0f840ff0 100644
--- a/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.html
+++ b/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.html
@@ -77,11 +77,13 @@
 
   <ng-template pTemplate="footer">
     <div class="supplier-dialog-footer">
+      <span *ngIf="progressLabel" class="supplier-dialog-progress">{{ progressLabel }}</span>
       <app-p-button
         [buttonText]="'ביטול'"
         [buttonColor]="ButtonColor.BLACK"
         [buttonSize]="ButtonSize.AUTO"
         [variant]="'outlined'"
+        [disabled]="isSaving || !!progressLabel"
         (onButtonClicked)="visibleChange.emit(false)">
       </app-p-button>
       <app-p-button
@@ -89,6 +91,7 @@
         [buttonColor]="ButtonColor.BLACK"
         [buttonSize]="ButtonSize.AUTO"
         [isLoading]="isSaving"
+        [disabled]="!!progressLabel"
         (onButtonClicked)="save.emit()">
       </app-p-button>
     </div>
diff --git a/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.scss b/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.scss
index 74dfadd1..1012fd2e 100644
--- a/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.scss
+++ b/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.scss
@@ -55,6 +55,12 @@
 
 .supplier-dialog-footer {
   display: flex;
+  align-items: center;
   gap: 10px;
   justify-content: flex-end;
 }
+.supplier-dialog-progress {
+  margin-inline-end: auto;
+  font-size: 0.85rem;
+  color: #6b7280;
+}
diff --git a/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.ts b/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.ts
index d6c9598b..a41d9766 100644
--- a/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.ts
+++ b/frontend/src/app/components/supplier-management-dialog/supplier-management-dialog.component.ts
@@ -51,6 +51,11 @@ export class SupplierManagementDialogComponent {
   /** Pre-filtered by the caller for the current fields.category. */
   @Input() subCategoryOptions: string[] = [];
   @Input() isSaving = false;
+  /** Non-null while the caller is running the post-save supplier cascade
+   *  (updating every other row sharing this supplier) — e.g. "מעדכן 3/12
+   *  שורות...". Replaces the footer buttons with this text and blocks
+   *  Cancel/Save until the cascade finishes. */
+  @Input() progressLabel: string | null = null;
 
   @Output() visibleChange = new EventEmitter<boolean>();
   @Output() save = new EventEmitter<void>();
diff --git a/frontend/src/app/pages/report-review/report-review.page.html b/frontend/src/app/pages/report-review/report-review.page.html
index c06dba24..3fa5606c 100644
--- a/frontend/src/app/pages/report-review/report-review.page.html
+++ b/frontend/src/app/pages/report-review/report-review.page.html
@@ -263,6 +263,7 @@
   [documentTypeOptions]="documentTypeOptions"
   [periodOptions]="editDraftPeriodOptions()"
   [showNewSupplierFlag]="editDialogRow()?.supplierStatusLabel === 'ספק חדש'"
+  [isSaving]="editDialogSaving()"
   (visibleChange)="$event ? null : onEditDialogCancel()"
   (save)="onEditDialogSave()"
   (categoryChange)="onEditDraftCategoryChange($event)"
@@ -287,6 +288,7 @@
   [categoryOptions]="categoryOptions()"
   [subCategoryOptions]="supplierDraftSubCategoryOptions()"
   [isSaving]="supplierDialogSaving()"
+  [progressLabel]="supplierCascadeProgressLabel()"
   (visibleChange)="$event ? null : onSupplierDialogCancel()"
   (save)="onSupplierDialogSave()"
   (categoryChange)="onSupplierDraftCategoryChange($event)"
diff --git a/frontend/src/app/pages/report-review/report-review.page.ts b/frontend/src/app/pages/report-review/report-review.page.ts
index 5d51b4e1..7f4d87e6 100644
--- a/frontend/src/app/pages/report-review/report-review.page.ts
+++ b/frontend/src/app/pages/report-review/report-review.page.ts
@@ -727,7 +727,6 @@ export class ReportReviewPage implements OnInit {
       supplier: row.supplier,
       reportPeriod: row.reportPeriod,
       reportPeriodOverridden: row.reportPeriodOverridden,
-      applyCascadeToSuppliers: true,
       allocationNumber: row.allocationNumber,
       documentType: row.documentType,
       saveAsSupplier: row.saveAsSupplier,
@@ -739,23 +738,35 @@ export class ReportReviewPage implements OnInit {
     this.editDialogVisible.set(false);
     this.editDialogRow.set(null);
     this.editDraft.set(null);
+    this.editDialogSaving.set(false);
   }
 
-  /** X / Escape / "ביטול" — discard the draft. Nothing was ever written
-   *  to the row, so there's nothing to roll back. */
+  /** X / Escape / "ביטול" — discard the draft. Nothing was persisted
+   *  server-side before this point (see onEditDialogSave), so there's
+   *  nothing to roll back. */
   onEditDialogCancel(): void {
+    if (this.editDialogSaving()) return;
     this.closeEditDialog();
   }
 
-  /** "שמור" — write the draft onto the row and close. Purely a local
-   *  mutation: no approve/network call here, matching the exact semantics
-   *  of the old inline toggleEditRow/saveEditRow pair. The actual
-   *  approve/commit only ever happens later via bulkApproveSelected or
-   *  confirmSaveAnyway. */
+  /** True while the blocking save below is in flight — disables the
+   *  dialog's footer buttons and shows a spinner on "שמור". */
+  editDialogSaving = signal<boolean>(false);
+
+  /**
+   * "שמור" — blocking: apply the draft to the row locally (so the table
+   * reflects it immediately), then persist it to the row's source DB
+   * record (ExtractedDocument for matched/doc_only — doc wins over slim,
+   * same as approveMatched; SlimTransaction for tx_only) via
+   * update-doc/update-tx. Only closes the dialog on success; on failure
+   * the dialog stays open with a toast, matching every other row action's
+   * error handling (runAction). Edits are single-row only now — no more
+   * cascade-on-save (that moved to the supplier-management dialog).
+   */
   onEditDialogSave(): void {
     const row = this.editDialogRow();
     const draft = this.editDraft();
-    if (!row || !draft) return;
+    if (!row || !draft || this.editDialogSaving()) return;
 
     const entry = draft.subCategoryId != null
       ? this.catalog().find(c => c.subCategoryId === draft.subCategoryId)
@@ -777,21 +788,54 @@ export class ReportReviewPage implements OnInit {
       row.documentTypeLabel = this.documentTypeLabel(draft.documentType ?? null);
       row.saveAsSupplier = draft.saveAsSupplier ?? true;
     }
+    this.bumpRows();
 
-    if (draft.applyCascadeToSuppliers) {
-      if (entry) this.cascadeToSupplierSiblings(row, (s) => this.applyCatalogRow(s, entry));
-      else this.cascadeToSupplierSiblings(row, (s) => this.clearClassification(s, draft.category));
-      this.markSupplierTouched(row);
-    }
+    this.editDialogSaving.set(true);
+    const obs$ = row.type === 'tx_only'
+      ? this.reviewService.updateTxFields(this.businessNumber(), row.slimTransactionId!, {
+          category: row.category,
+          subCategory: row.subCategory,
+          subCategoryId: row.subCategoryId ?? undefined,
+          vatPercent: row.vatPercent,
+          taxPercent: row.taxPercent,
+          isEquipment: row.isEquipment,
+          reportPeriod: row.reportPeriodOverridden ? row.reportPeriod : undefined,
+        })
+      : this.reviewService.updateDocFields(this.businessNumber(), row.documentId!, {
+          category: row.category,
+          subCategory: row.subCategory,
+          subCategoryId: row.subCategoryId ?? undefined,
+          vatPercent: row.vatPercent,
+          taxPercent: row.taxPercent,
+          isEquipment: row.isEquipment,
+          date: row.date,
+          amount: row.amount,
+          supplierId: row.supplierId,
+          supplier: row.supplier,
+          invoiceNumber: row.invoiceNumber,
+          allocationNumber: row.allocationNumber,
+          documentType: row.documentType ?? undefined,
+          reportPeriod: row.reportPeriodOverridden ? row.reportPeriod : undefined,
+        });
 
-    this.bumpRows();
-    this.closeEditDialog();
+    obs$
+      .pipe(
+        catchError(err => {
+          const detail = err?.error?.message ?? err?.message ?? 'שמירת העריכה נכשלה';
+          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
+          return EMPTY;
+        }),
+        finalize(() => this.editDialogSaving.set(false)),
+      )
+      .subscribe(() => {
+        this.closeEditDialog();
+      });
   }
 
   /** Classification pickers inside the dialog — same resolution rules as
    *  the old onCategoryChange/onSubCategoryChange/onCardChange, just
-   *  targeting the local draft instead of the row directly (no cascade
-   *  here — cascade only runs once, at Save, see onEditDialogSave). */
+   *  targeting the local draft instead of the row directly. Edits are
+   *  single-row only (see onEditDialogSave) — no cascade here. */
   onEditDraftCategoryChange(picked: string): void {
     this.editDraft.update(d => d && ({
       ...d,
@@ -919,6 +963,15 @@ export class ReportReviewPage implements OnInit {
     return this.subCategoriesForCategory(d.category).map(c => c.subCategory);
   });
 
+  /** Non-null while runSupplierCascade is updating sibling rows after a
+   *  successful supplier save. Drives the dialog's progress text + button
+   *  disable via [progressLabel]. */
+  supplierCascadeProgress = signal<{ done: number; total: number } | null>(null);
+  supplierCascadeProgressLabel = computed<string | null>(() => {
+    const p = this.supplierCascadeProgress();
+    return p ? `מעדכן ${p.done}/${p.total} שורות...` : null;
+  });
+
   /** Lazily-loaded, cached full supplier list — the review row only
    *  carries the supplier's tax-ID string (see ReviewDocSummary.supplierId
    *  in report-review.service.ts), not the Supplier table's numeric PK, so
@@ -1012,9 +1065,14 @@ export class ReportReviewPage implements OnInit {
     this.supplierDialogRow = null;
     this.supplierDialogId = null;
     this.supplierDraft.set(null);
+    this.supplierCascadeProgress.set(null);
   }
 
+  /** Blocked while the post-save cascade is running — closing mid-cascade
+   *  would abandon the progress UI, though the queued update-doc/update-tx
+   *  calls already fired would still land (see runSupplierCascadeStep). */
   onSupplierDialogCancel(): void {
+    if (this.supplierCascadeProgress()) return;
     this.closeSupplierDialog();
   }
 
@@ -1072,12 +1130,13 @@ export class ReportReviewPage implements OnInit {
     });
   }
 
-  /** "שמור" — POST/PATCH the Supplier record, then reflect the saved
-   *  identity back onto the row (supplier name/id + "ספק מוכר" status)
-   *  without a full preview re-fetch. Never touches the row's OWN
-   *  classification (category/subCategory/percents) — the Supplier
-   *  record's fields are defaults for FUTURE expenses, a separate concern
-   *  from this row's already-resolved classification. */
+  /** "שמור" — POST/PATCH the Supplier record, reflect the saved identity
+   *  back onto the triggering row (supplier name/id + "ספק מוכר" status),
+   *  then cascade the saved classification (category/subCategory/
+   *  subCategoryId/vatPercent/taxPercent/isEquipment) onto every OTHER
+   *  current row matching this supplier (see findSupplierSiblingRows) —
+   *  writing each one to its DB source row via update-doc/update-tx, not
+   *  just in-memory. Closes only once the cascade (if any) finishes. */
   onSupplierDialogSave(): void {
     const draft = this.supplierDraft();
     const row = this.supplierDialogRow;
@@ -1127,9 +1186,111 @@ export class ReportReviewPage implements OnInit {
         row.supplier = payload.supplier;
         row.supplierId = payload.supplierID ?? '';
         row.supplierStatusLabel = 'ספק מוכר';
-        this.bumpRows();
         this.suppliersCache = null;
-        this.closeSupplierDialog();
+
+        const entry = draft.subCategoryId != null
+          ? this.catalog().find(c => c.subCategoryId === draft.subCategoryId)
+          : undefined;
+        const siblings = this.findSupplierSiblingRows(payload.supplierID ?? '', payload.supplier);
+        this.bumpRows();
+
+        if (siblings.length === 0) {
+          this.closeSupplierDialog();
+          return;
+        }
+        this.runSupplierCascade(siblings, entry, draft.category);
+      });
+  }
+
+  /** Every CURRENT row matching the just-saved supplier's identity — doc/
+   *  matched rows by supplierId (trimmed, exact), tx_only rows by
+   *  normalized name (they never carry a supplierId). Empty identity on
+   *  either side never matches (guards against every empty-supplierId
+   *  cash-vendor row falsely matching each other). Includes the row that
+   *  triggered the dialog — it matches its own just-saved identity too. */
+  private findSupplierSiblingRows(supplierId: string, supplierName: string): EditableReviewRow[] {
+    const sid = supplierId?.trim();
+    const sname = this.normalizeSupplierName(supplierName);
+    return this.rows().filter(r => {
+      if (r.type === 'tx_only') {
+        return !!sname && this.normalizeSupplierName(r.supplier) === sname;
+      }
+      return !!sid && r.supplierId.trim() === sid;
+    });
+  }
+
+  /** Sequential (not parallel — same DB back-pressure reasoning as
+   *  runBulkQueue) update of every matching row's classification, each
+   *  persisted via update-doc/update-tx. A single row's failure doesn't
+   *  stop the rest — it's flagged with saveStatus/saveError (same as
+   *  runAction) and the cascade moves on. Closes the dialog only once
+   *  every row has been attempted. */
+  private runSupplierCascade(
+    rows: EditableReviewRow[],
+    entry: CatalogRow | undefined,
+    draftCategory: string,
+  ): void {
+    this.markSupplierTouched(rows[0]);
+    this.supplierCascadeProgress.set({ done: 0, total: rows.length });
+    this.runSupplierCascadeStep(rows, 0, entry, draftCategory, { succeeded: 0, failed: 0 });
+  }
+
+  private runSupplierCascadeStep(
+    rows: EditableReviewRow[],
+    idx: number,
+    entry: CatalogRow | undefined,
+    draftCategory: string,
+    stats: { succeeded: number; failed: number },
+  ): void {
+    if (idx >= rows.length) {
+      this.supplierCascadeProgress.set(null);
+      this.bumpRows();
+      if (stats.failed > 0) {
+        this.messageService.add({
+          severity: 'warn', summary: 'עדכון חלקי',
+          detail: `עודכנו ${stats.succeeded} שורות, ${stats.failed} נכשלו — ראה פירוט בטבלה`,
+          life: 6000, key: 'br',
+        });
+      }
+      this.closeSupplierDialog();
+      return;
+    }
+
+    const row = rows[idx];
+    if (entry) this.applyCatalogRow(row, entry);
+    else this.clearClassification(row, draftCategory);
+    row.saveStatus = 'pending';
+    this.supplierCascadeProgress.set({ done: idx, total: rows.length });
+    this.bumpRows();
+
+    const fields = {
+      category: row.category,
+      subCategory: row.subCategory,
+      subCategoryId: row.subCategoryId ?? undefined,
+      vatPercent: row.vatPercent,
+      taxPercent: row.taxPercent,
+      isEquipment: row.isEquipment,
+    };
+    const obs$ = row.type === 'tx_only'
+      ? this.reviewService.updateTxFields(this.businessNumber(), row.slimTransactionId!, fields)
+      : this.reviewService.updateDocFields(this.businessNumber(), row.documentId!, fields);
+
+    obs$
+      .pipe(
+        catchError(err => {
+          row.saveStatus = 'failed';
+          row.saveError = err?.error?.message ?? err?.message ?? 'עדכון השורה נכשל';
+          stats.failed++;
+          return of(null);
+        }),
+      )
+      .subscribe(result => {
+        if (result !== null) {
+          row.saveStatus = null;
+          row.saveError = null;
+          stats.succeeded++;
+        }
+        this.runSupplierCascadeStep(rows, idx + 1, entry, draftCategory, stats);
       });
   }
 
@@ -1370,29 +1531,6 @@ export class ReportReviewPage implements OnInit {
    *  The "both empty" guard prevents leaking edits between two rows
    *  with the same name but different tax IDs (those ARE different
    *  legal entities — e.g. two stores sharing a chain brand). */
-  private cascadeToSupplierSiblings(
-    source: EditableReviewRow,
-    mutate: (sibling: EditableReviewRow) => void,
-  ): void {
-    const sid = source.supplierId?.trim();
-    const sname = source.supplier?.trim();
-    if (!sid && !sname) return; // tx_only rows with no merchant info
-    for (const r of this.rows()) {
-      if (r === source) continue;
-      const rsid = r.supplierId?.trim();
-      const rsname = r.supplier?.trim();
-      if (sid) {
-        if (rsid !== sid) continue;
-      } else {
-        // source has no supplierId → only match siblings that ALSO have
-        // no supplierId AND share the trimmed name.
-        if (rsid) continue;
-        if (!rsname || rsname !== sname) continue;
-      }
-      mutate(r);
-    }
-  }
-
   /** Derive the identity key used for the blue-highlight grouping.
    *  Matches the cascade rule: supplierId when present, otherwise the
    *  trimmed supplier name. Tagged so an empty-id row named "123" can't
diff --git a/frontend/src/app/services/report-review.service.ts b/frontend/src/app/services/report-review.service.ts
index b16e6ccb..92482451 100644
--- a/frontend/src/app/services/report-review.service.ts
+++ b/frontend/src/app/services/report-review.service.ts
@@ -196,6 +196,34 @@ export interface ReviewOverrides {
   amount?: number;
 }
 
+/**
+ * Fields the review edit dialog can persist directly onto a pending
+ * document BEFORE approval (see ReportReviewService.updateDocFields on
+ * the backend) — every ReviewOverrides field that actually has a backing
+ * column on ExtractedDocument. Excludes saveAsSupplier/
+ * acknowledgeDuplicate (approve-time-only behavior flags).
+ */
+export type UpdateDocFields = Pick<ReviewOverrides,
+  | 'category' | 'subCategory' | 'subCategoryId'
+  | 'vatPercent' | 'taxPercent' | 'isEquipment'
+  | 'date' | 'amount' | 'supplierId' | 'supplier'
+  | 'invoiceNumber' | 'allocationNumber' | 'documentType'
+  | 'reportPeriod'
+>;
+
+/**
+ * Fields the review edit dialog can persist directly onto a pending
+ * transaction BEFORE approval (see ReportReviewService.updateTxFields).
+ * A bank transaction has no document-side concept and no date/amount
+ * column of its own (those live on the read-only bank-fed cache) — much
+ * narrower than UpdateDocFields.
+ */
+export type UpdateTxFields = Pick<ReviewOverrides,
+  | 'category' | 'subCategory' | 'subCategoryId'
+  | 'vatPercent' | 'taxPercent' | 'isEquipment'
+  | 'reportPeriod'
+>;
+
 @Injectable({ providedIn: 'root' })
 export class ReportReviewService {
   constructor(private http: HttpClient) {}
@@ -374,6 +402,33 @@ export class ReportReviewService {
     );
   }
 
+  /** Persist an in-progress edit onto a pending document (matched/
+   *  doc_only) — NOT an approve, no status change. Lets the edit dialog's
+   *  "שמור" block on the server confirming the write instead of only
+   *  mutating the in-memory row until the user later clicks approve. */
+  updateDocFields(
+    businessNumber: string,
+    documentId: number,
+    fields: UpdateDocFields,
+  ): Observable<{ ok: true }> {
+    return this.http.patch<{ ok: true }>(
+      `${environment.apiUrl}reports/me/review/update-doc/${documentId}`,
+      { businessNumber, fields },
+    );
+  }
+
+  /** Same as updateDocFields, for the transaction side of a tx_only row. */
+  updateTxFields(
+    businessNumber: string,
+    slimTransactionId: number,
+    fields: UpdateTxFields,
+  ): Observable<{ ok: true }> {
+    return this.http.patch<{ ok: true }>(
+      `${environment.apiUrl}reports/me/review/update-tx/${slimTransactionId}`,
+      { businessNumber, fields },
+    );
+  }
+
   /** Merged expense catalog with card law + section per row — the approval
    *  screen's single picker/preview data source (includePrivate so a user
    *  can classify a personal purchase as private). */
```
