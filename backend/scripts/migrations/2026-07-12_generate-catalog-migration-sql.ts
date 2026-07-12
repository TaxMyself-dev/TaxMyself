/**
 * Reads 2026-07-12_catalog_migration_result.json (the readback dump written
 * by 2026-07-12_catalog_migration.ts's MODE=apply) and prints literal SQL
 * INSERT statements for cutover.sql Section 4b — the actual rows written to
 * keepintax_prodcopy, not re-derived from static seed data (unlike Phase 1's
 * chart, these codes/ids include dynamically-allocated values).
 *
 * Regenerate with: npx ts-node -r tsconfig-paths/register scripts/migrations/2026-07-12_generate-catalog-migration-sql.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const dump = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '2026-07-12_catalog_migration_result.json'), 'utf8'),
);

function sqlVal(v: any): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function insertBlock(table: string, columns: string[], rows: any[]): string {
  if (!rows.length) return `-- (no rows for ${table})`;
  const cols = columns.map((c) => `\`${c}\``).join(', ');
  const values = rows
    .map((r) => `  (${columns.map((c) => sqlVal(r[c])).join(', ')})`)
    .join(',\n');
  return `INSERT INTO \`${table}\` (${cols}) VALUES\n${values};`;
}

const accountCols = [
  'id', 'code', 'name', 'type', 'pnlCategory', 'displayOrder', 'sectionId', 'code6111',
  'vatPercent', 'taxPercent', 'reductionPercent', 'isEquipment', 'recognitionType',
  'ownerType', 'chartOwnerKey', 'accountantId', 'userId', 'businessNumber', 'visibilityScope', 'isActive',
];
const categoryCols = [
  'id', 'name', 'type', 'defaultRecognitionType', 'ownerType', 'chartOwnerKey', 'accountantId',
  'userId', 'businessNumber', 'visibilityScope', 'isDefault', 'isActive', 'createdByUserId',
];
const subCategoryCols = [
  'id', 'categoryId', 'name', 'isPrivate', 'accountId', 'necessity', 'reportScope', 'ownerType',
  'chartOwnerKey', 'accountantId', 'userId', 'businessNumber', 'visibilityScope', 'approvalStatus',
  'approvedByUserId', 'approvedAt', 'rejectedByUserId', 'rejectedAt', 'rejectionReason',
  'isDefault', 'isActive', 'createdByUserId',
];

console.log('-- booking_account (2 new rows, this-session technical accounts) --');
console.log(insertBlock('booking_account', accountCols, dump.writtenAccounts));
console.log('');
console.log(`-- category (${dump.writtenCategories.length} rows) --`);
console.log(insertBlock('category', categoryCols, dump.writtenCategories));
console.log('');
console.log(`-- sub_category (${dump.writtenSubCategories.length} rows) --`);
console.log(insertBlock('sub_category', subCategoryCols, dump.writtenSubCategories));
