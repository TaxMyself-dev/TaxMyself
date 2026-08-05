/**
 * Phase 3.2/3.3/3.4 + the shadow-table portion of 3.5 — FK backfill and
 * expense snapshots (D6/D7/D8), run against keepintax_prodcopy AFTER
 * 2026-07-13_phase3_schema.sql has been applied.
 *
 * Steps (all in one transaction on MODE=apply):
 *  3.2 — resolve expense.subCategoryId from (category, subCategory,
 *        businessNumber) against the merged catalog (CatalogService,
 *        CLIENT > SYSTEM by name, D4). HARD STOP: if any expense row fails
 *        to resolve, MODE=apply refuses — per the explicit session
 *        instruction, production has zero orphans (D14) so this should
 *        resolve 100% automatically; any miss means something changed and
 *        needs Elazar, not a silent fallback.
 *  3.3 — for each expense, find its journal entry (by journalEntryNumber,
 *        falling back to referenceType=EXPENSE/referenceId like
 *        syncExpenseJournalEntry does) and its expense line (the one
 *        journal_line row with subCategoryName IS NOT NULL — VAT/bank
 *        lines never set it). From THAT line's accountCode (the journal is
 *        the historical source of truth, not the live catalog) resolve the
 *        booking_account and fill account/section/6111 snapshot columns.
 *        approvalStatus: journal entry found -> APPROVED; not found ->
 *        MISSING_ACCOUNTING_MAPPING (if its resolved sub_category is) or
 *        PENDING otherwise.
 *  3.4 — expense.description via buildExpenseDescription (D7); every
 *        production expense already has category+subCategory (NOT NULL
 *        columns) so the classification branch always applies. Copies into
 *        journal_entry.description only where that column is currently
 *        NULL/empty (existing EXPENSE-referenced entries already carry
 *        "EXPENSE #N - supplier" and are left untouched).
 *  3.5 (shadow tables) — best-effort subCategoryId backfill by name on
 *        supplier/classified_transactions/extracted_document; unmatched
 *        stays NULL + logged (NOT a hard stop — these are display-only
 *        pointers, unlike expense.subCategoryId).
 *  3.1 (documentKind) — extracted_document.documentKind backfill: rows
 *        already converted to an Expense -> EXPENSE_INVOICE; else inferred
 *        from documentType (FORM_106/TAX_FORM -> ANNUAL_DOCUMENT; other
 *        expense-shaped types -> EXPENSE_INVOICE; else UNIDENTIFIED).
 *
 * MODE=review (default): resolves everything, writes
 *   docs/redesign/orphan-resolution.md, writes NOTHING to the DB.
 * MODE=apply CONFIRM=yes: re-runs the identical resolution inside one
 *   transaction and writes it.
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/migrations/2026-07-13_phase3_backfill.ts
 */
import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../../src/app.module';
import { CatalogService } from '../../src/bookkeeping/catalog.service';
import { ExpenseApprovalStatus, ApprovalStatus, DocumentKind } from '../../src/enum';
import { buildExpenseDescription } from '../../src/expenses/expense-description.util';
import { ExtractedDocumentType } from '../../src/documents/extracted-document.entity';

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const REVIEW_OUT = path.resolve(__dirname, '../../../docs/redesign/orphan-resolution.md');

const EXPENSE_SHAPED_DOC_TYPES = new Set([
  ExtractedDocumentType.INVOICE,
  ExtractedDocumentType.RECEIPT,
  ExtractedDocumentType.TAX_INVOICE_RECEIPT,
  ExtractedDocumentType.CREDIT_INVOICE,
  ExtractedDocumentType.INVOICE_RECEIPT_PAIR,
]);
const ANNUAL_SHAPED_DOC_TYPES = new Set([ExtractedDocumentType.FORM_106, ExtractedDocumentType.TAX_FORM]);

interface ExpenseRow {
  id: number;
  category: string;
  subCategory: string;
  userId: string;
  businessNumber: string;
  journalEntryNumber: number | null;
}

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE !== 'keepintax_prodcopy') {
    throw new Error(
      `Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}. ` +
      `Set DB_DATABASE=keepintax_prodcopy explicitly before running this script.`,
    );
  }
  if (MODE === 'apply' && process.env.CONFIRM !== 'yes') {
    throw new Error('MODE=apply requires CONFIRM=yes — refusing to write without explicit confirmation.');
  }
  console.log(`[phase3_backfill] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dataSource = app.get(DataSource);
  const catalogService = app.get(CatalogService);

  // ── 3.2: resolve every distinct (category, subCategory, businessNumber) ──
  const expenses: ExpenseRow[] = await dataSource.query(
    `SELECT id, category, subCategory, userId, businessNumber, journalEntryNumber FROM expense ORDER BY id`,
  );
  console.log(`[phase3_backfill] ${expenses.length} expense rows loaded`);

  const pairKey = (category: string, subCategory: string, businessNumber: string) => `${businessNumber}::${category}::${subCategory}`;
  const resolvedSubCategoryId = new Map<string, number | null>();
  const unresolved: ExpenseRow[] = [];

  for (const e of expenses) {
    const key = pairKey(e.category, e.subCategory, e.businessNumber);
    if (!resolvedSubCategoryId.has(key)) {
      const resolved = await catalogService.resolveByName(e.category, e.subCategory, { businessNumber: e.businessNumber });
      resolvedSubCategoryId.set(key, resolved?.subCategory?.id ?? null);
    }
    if (resolvedSubCategoryId.get(key) == null) unresolved.push(e);
  }

  console.log(
    `[phase3_backfill] 3.2: ${resolvedSubCategoryId.size} distinct pairs resolved, ` +
    `${unresolved.length} expense row(s) unresolved`,
  );

  // ── 3.3 prep: per-expense journal lookup (journalEntryNumber, else referenceType/referenceId fallback) ──
  interface ExpenseLineage {
    expenseId: number;
    journalEntryId: number | null;
    accountCode: string | null;
    journalDescription: string | null;
  }
  const lineage: ExpenseLineage[] = [];
  for (const e of expenses) {
    let entry: { id: number; description: string | null } | undefined;
    if (e.journalEntryNumber != null) {
      [entry] = await dataSource.query(
        `SELECT id, description FROM journal_entry WHERE entryNumber = ? AND issuerBusinessNumber = ? LIMIT 1`,
        [e.journalEntryNumber, e.businessNumber],
      );
    }
    if (!entry) {
      [entry] = await dataSource.query(
        `SELECT id, description FROM journal_entry WHERE referenceType = 'EXPENSE' AND referenceId = ? AND issuerBusinessNumber = ? LIMIT 1`,
        [e.id, e.businessNumber],
      );
    }
    if (!entry) {
      lineage.push({ expenseId: e.id, journalEntryId: null, accountCode: null, journalDescription: null });
      continue;
    }
    const [line] = await dataSource.query(
      `SELECT accountCode FROM journal_line WHERE journalEntryId = ? AND subCategoryName IS NOT NULL LIMIT 1`,
      [entry.id],
    );
    lineage.push({
      expenseId: e.id,
      journalEntryId: entry.id,
      accountCode: line?.accountCode ?? null,
      journalDescription: entry.description ?? null,
    });
  }
  const lineageByExpenseId = new Map(lineage.map((l) => [l.expenseId, l]));
  const noJournalCount = lineage.filter((l) => l.journalEntryId == null).length;
  const noExpenseLineCount = lineage.filter((l) => l.journalEntryId != null && l.accountCode == null).length;
  console.log(
    `[phase3_backfill] 3.3: ${lineage.length - noJournalCount} expenses have a resolvable journal entry, ` +
    `${noJournalCount} do not; ${noExpenseLineCount} of the found entries have no subCategoryName-tagged line`,
  );

  // ── review doc (always written, per 3.2's explicit "do not guess silently") ──
  const lines: string[] = [];
  lines.push('# Phase 3.2 — expense.subCategoryId orphan resolution');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} by \`backend/scripts/migrations/2026-07-13_phase3_backfill.ts\` (MODE=${MODE}), against \`${process.env.DB_DATABASE}\`.`);
  lines.push('');
  if (unresolved.length === 0) {
    lines.push(`**Zero orphans.** All ${expenses.length} expense rows (${resolvedSubCategoryId.size} distinct (category, subCategory, businessNumber) pairs) resolved to a real sub_category row via the merged catalog (CLIENT > SYSTEM by name, D4). Matches D14's "production has zero orphans" expectation exactly.`);
  } else {
    lines.push(`**${unresolved.length} orphan expense row(s) found — STOP, needs Elazar's decision before MODE=apply can proceed.**`);
    lines.push('');
    lines.push('| expense.id | category | subCategory | businessNumber | proposed action |');
    lines.push('|---|---|---|---|---|');
    for (const e of unresolved) {
      lines.push(`| ${e.id} | ${e.category} | ${e.subCategory} | ${e.businessNumber} | UNRESOLVED — no sub_category matches this (category,subCategory) pair in SYSTEM or CLIENT_${e.businessNumber} scope. Needs a manual decision: is this a typo'd/garbage pair (map to nearest real sub_category) or a genuine missing mapping (create a CLIENT sub_category, approvalStatus=MISSING_ACCOUNTING_MAPPING, per D5)? |`);
    }
  }
  lines.push('');
  lines.push('## 3.3 journal lineage summary');
  lines.push('');
  lines.push(`- ${lineage.length - noJournalCount} / ${lineage.length} expenses have a resolvable journal entry (by journalEntryNumber, falling back to referenceType=EXPENSE+referenceId — same lookup order as \`ExpensesService.syncExpenseJournalEntry\`).`);
  lines.push(`- ${noJournalCount} expense(s) have no journal entry at all -> approvalStatus backfills to PENDING (or MISSING_ACCOUNTING_MAPPING if their resolved sub_category is).`);
  lines.push(`- ${noExpenseLineCount} found journal entries have no line with subCategoryName set -> accountCodeSnapshot etc. stay NULL for those rows (logged, not a hard stop — snapshot absence on a non-standard entry is surfaced by 3.6's verification, not guessed here).`);
  fs.writeFileSync(REVIEW_OUT, lines.join('\n') + '\n');
  console.log(`[phase3_backfill] wrote ${REVIEW_OUT}`);

  if (unresolved.length > 0) {
    if (MODE === 'apply') {
      throw new Error(`${unresolved.length} unresolved expense row(s) — refusing to write. See ${REVIEW_OUT}.`);
    }
    console.log('[phase3_backfill] MODE=review: stopping short of the shadow-table/documentKind resolution summary since 3.2 is not clean — re-run after resolving the orphans above.');
    await app.close();
    return;
  }

  // ── 3.5 shadow-table backfill preview (supplier / classified_transactions / extracted_document) ──
  async function previewShadowBackfill(table: string, idCol: string, categoryCol: string, subCategoryCol: string, businessCol: string | null) {
    const rows: { id: number; category: string | null; subCategory: string | null; businessNumber: string | null }[] = await dataSource.query(
      `SELECT ${idCol} as id, ${categoryCol} as category, ${subCategoryCol} as subCategory${businessCol ? `, ${businessCol} as businessNumber` : ', NULL as businessNumber'} FROM \`${table}\``,
    );
    let matched = 0;
    let skippedNullFields = 0;
    let unmatched = 0;
    for (const r of rows) {
      if (!r.category || !r.subCategory) { skippedNullFields++; continue; }
      const resolved = await catalogService.resolveByName(r.category, r.subCategory, { businessNumber: r.businessNumber });
      if (resolved?.subCategory?.id != null) matched++;
      else unmatched++;
    }
    console.log(`[phase3_backfill] 3.5 preview ${table}: ${rows.length} rows, ${matched} matched, ${unmatched} unmatched (left NULL), ${skippedNullFields} skipped (NULL category/subCategory)`);
  }
  await previewShadowBackfill('supplier', 'id', 'category', 'subCategory', 'businessNumber');
  await previewShadowBackfill('classified_transactions', 'id', 'category', 'subCategory', 'businessNumber');
  await previewShadowBackfill('extracted_document', 'id', 'category', 'sub_category', 'business_number');

  // ── documentKind preview ──
  const docs: { id: number; documentType: string | null; confirmedExpenseId: number | null }[] = await dataSource.query(
    `SELECT id, document_type as documentType, confirmed_expense_id as confirmedExpenseId FROM extracted_document`,
  );
  let kindExpense = 0, kindAnnual = 0, kindUnidentified = 0;
  for (const d of docs) {
    if (d.confirmedExpenseId != null) kindExpense++;
    else if (d.documentType && EXPENSE_SHAPED_DOC_TYPES.has(d.documentType as ExtractedDocumentType)) kindExpense++;
    else if (d.documentType && ANNUAL_SHAPED_DOC_TYPES.has(d.documentType as ExtractedDocumentType)) kindAnnual++;
    else kindUnidentified++;
  }
  console.log(`[phase3_backfill] documentKind preview: ${docs.length} rows -> EXPENSE_INVOICE=${kindExpense} ANNUAL_DOCUMENT=${kindAnnual} UNIDENTIFIED=${kindUnidentified}`);

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
    await app.close();
    return;
  }

  // ── MODE=apply: write everything in one transaction ──
  let expenseUpdates = 0, journalEntryDescriptionUpdates = 0, snapshotFilled = 0;
  await dataSource.transaction(async (manager: EntityManager) => {
    for (const e of expenses) {
      const key = pairKey(e.category, e.subCategory, e.businessNumber);
      const subCategoryId = resolvedSubCategoryId.get(key)!; // guaranteed non-null, checked above

      const l = lineageByExpenseId.get(e.id)!;
      const approvalStatus = l.journalEntryId != null ? ExpenseApprovalStatus.APPROVED : ExpenseApprovalStatus.PENDING;

      let sectionIdSnap: number | null = null, sectionCodeSnap: string | null = null, sectionNameSnap: string | null = null;
      let accountIdSnap: number | null = null, accountCodeSnap: string | null = null, accountNameSnap: string | null = null;
      let code6111Snap: string | null = null;
      let finalApprovalStatus: ExpenseApprovalStatus = approvalStatus;

      if (l.accountCode) {
        const [account] = await manager.query(
          `SELECT ba.*, s.code as sectionCode, s.name as sectionName FROM booking_account ba LEFT JOIN accounting_section s ON s.id = ba.sectionId WHERE ba.code = ? ORDER BY (ba.chartOwnerKey = 'SYSTEM') DESC LIMIT 1`,
          [l.accountCode],
        );
        if (account) {
          accountIdSnap = account.id;
          accountCodeSnap = account.code;
          accountNameSnap = account.name;
          code6111Snap = account.code6111 ?? null;
          sectionIdSnap = account.sectionId ?? null;
          sectionCodeSnap = account.sectionCode ?? null;
          sectionNameSnap = account.sectionName ?? null;
        } else {
          console.warn(`[phase3_backfill] WARNING: expense ${e.id} journal line accountCode=${l.accountCode} has no matching booking_account row — snapshot left NULL`);
        }
      } else if (approvalStatus === ExpenseApprovalStatus.PENDING) {
        // No journal entry at all — fall back to the resolved sub_category's own approvalStatus (D5).
        const [sub] = await manager.query(`SELECT approvalStatus FROM sub_category WHERE id = ?`, [subCategoryId]);
        if (sub?.approvalStatus === ApprovalStatus.MISSING_ACCOUNTING_MAPPING) {
          finalApprovalStatus = ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING;
        }
      }
      if (accountIdSnap != null) snapshotFilled++;

      const description = buildExpenseDescription({ category: e.category, subCategory: e.subCategory });

      await manager.query(
        `UPDATE expense SET subCategoryId = ?, sectionIdSnapshot = ?, sectionCodeSnapshot = ?, sectionNameSnapshot = ?, accountIdSnapshot = ?, accountCodeSnapshot = ?, accountNameSnapshot = ?, code6111Snapshot = ?, description = ?, approvalStatus = ? WHERE id = ?`,
        [subCategoryId, sectionIdSnap, sectionCodeSnap, sectionNameSnap, accountIdSnap, accountCodeSnap, accountNameSnap, code6111Snap, description, finalApprovalStatus, e.id],
      );
      expenseUpdates++;

      if (l.journalEntryId != null && (l.journalDescription == null || l.journalDescription === '')) {
        await manager.query(`UPDATE journal_entry SET description = ? WHERE id = ?`, [description, l.journalEntryId]);
        journalEntryDescriptionUpdates++;
      }
    }

    // ── 3.5 shadow-table backfill (best-effort, not a hard stop) ──
    async function applyShadowBackfill(table: string, idCol: string, categoryCol: string, subCategoryCol: string, businessCol: string | null) {
      const rows: { id: number; category: string | null; subCategory: string | null; businessNumber: string | null }[] = await manager.query(
        `SELECT ${idCol} as id, ${categoryCol} as category, ${subCategoryCol} as subCategory${businessCol ? `, ${businessCol} as businessNumber` : ', NULL as businessNumber'} FROM \`${table}\``,
      );
      let matched = 0, unmatched = 0;
      for (const r of rows) {
        if (!r.category || !r.subCategory) continue;
        const resolved = await catalogService.resolveByName(r.category, r.subCategory, { businessNumber: r.businessNumber });
        if (resolved?.subCategory?.id != null) {
          await manager.query(`UPDATE \`${table}\` SET subCategoryId = ? WHERE ${idCol} = ?`, [resolved.subCategory.id, r.id]);
          matched++;
        } else {
          unmatched++;
        }
      }
      console.log(`[phase3_backfill] 3.5 applied ${table}: ${matched} matched + written, ${unmatched} left NULL`);
    }
    await applyShadowBackfill('supplier', 'id', 'category', 'subCategory', 'businessNumber');
    await applyShadowBackfill('classified_transactions', 'id', 'category', 'subCategory', 'businessNumber');

    // extracted_document uses snake_case columns and its own subCategoryId column name differs (sub_category_id).
    const docsForBackfill: { id: number; category: string | null; subCategory: string | null; businessNumber: string | null }[] = await manager.query(
      `SELECT id, category, sub_category as subCategory, business_number as businessNumber FROM extracted_document`,
    );
    let edMatched = 0, edUnmatched = 0;
    for (const r of docsForBackfill) {
      if (!r.category || !r.subCategory) continue;
      const resolved = await catalogService.resolveByName(r.category, r.subCategory, { businessNumber: r.businessNumber });
      if (resolved?.subCategory?.id != null) {
        await manager.query(`UPDATE extracted_document SET sub_category_id = ? WHERE id = ?`, [resolved.subCategory.id, r.id]);
        edMatched++;
      } else {
        edUnmatched++;
      }
    }
    console.log(`[phase3_backfill] 3.5 applied extracted_document: ${edMatched} matched + written, ${edUnmatched} left NULL`);

    // ── documentKind backfill ──
    const docsForKind: { id: number; documentType: string | null; confirmedExpenseId: number | null }[] = await manager.query(
      `SELECT id, document_type as documentType, confirmed_expense_id as confirmedExpenseId FROM extracted_document`,
    );
    let kindWrites = 0;
    for (const d of docsForKind) {
      let kind: DocumentKind;
      if (d.confirmedExpenseId != null) kind = DocumentKind.EXPENSE_INVOICE;
      else if (d.documentType && EXPENSE_SHAPED_DOC_TYPES.has(d.documentType as ExtractedDocumentType)) kind = DocumentKind.EXPENSE_INVOICE;
      else if (d.documentType && ANNUAL_SHAPED_DOC_TYPES.has(d.documentType as ExtractedDocumentType)) kind = DocumentKind.ANNUAL_DOCUMENT;
      else kind = DocumentKind.UNIDENTIFIED;
      await manager.query(`UPDATE extracted_document SET document_kind = ? WHERE id = ?`, [kind, d.id]);
      kindWrites++;
    }
    console.log(`[phase3_backfill] documentKind applied: ${kindWrites} rows written`);
  });

  console.log(
    `[phase3_backfill] MODE=apply complete: ${expenseUpdates} expense rows updated ` +
    `(${snapshotFilled} with a non-NULL account snapshot), ${journalEntryDescriptionUpdates} journal_entry.description backfilled.`,
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
